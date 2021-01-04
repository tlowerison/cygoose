import { cacheDirName, cacheDirPath, cacheDirRoot, exec, getEnvVars, indexFilePath, mkdir, readFile, writeFile } from "./constants";
import { fromPairs, toPairs } from "ramda";
import { join } from "path";
import { v4 as uuid } from "uuid";

export type Config = {
  hash: string;
  projectRoot: string;
  projectName: string;
  migrationsPath: string;
  envFile: string;
  neo4jAddress: string;
  neo4jDatabase: string;
  neo4jPassword?: string;
  neo4jUsername: string;
  k8sContext: string;
  k8sNamespace: string;
  k8sPod: string;
};

export const relativeProjectRootPrefix = "<project-root>";
const hashSeparator = "=";
const separator = ";";

export const readCacheIndex = async () => {
  const file = await getIndexFile();
  return file.split("\n").map(line => line.trim()).filter(line => line !== "").map(parseCacheLine);
};

export const readFromCacheIndex = async (projectName: string) => {
  const findings = await findConfig(projectName);
  const envVars = await getEnvVars(findings.config?.envFile);
  return { ...envVars, ...findings.config } as Config;
};

export const removeFromCacheIndex = async (projectName: string) => {
  const findings = await findConfig(projectName);
  if (!foundConfig(findings)) {
    console.log(`No project named '${projectName}" under this directory`);
  } else {
    await writeFile(indexFilePath, [
      ...findings.lines.slice(0, findings.matchIndex),
      ...findings.lines.slice(findings.matchIndex + 1),
    ].join("\n"));
  }
};

export const writeToCacheIndex = async (command: "init" | "set", { projectName, ...proposedConfig }: Partial<Config> & { projectName: string }) => {
  const findings = await findConfig(projectName);
  if (command === "init") {
    const { migrationsPath } = proposedConfig;
    if (foundConfig(findings)) {
      console.error(`A project already exists with name '${projectName}"`);
      return;
    } else if (!migrationsPath) {
      console.error(`Could not init project with name '${projectName}", no migrations path provided`);
      return;
    }
    const newConfig = { projectName, ...proposedConfig };
    const projectRoot = process.cwd();
    const hash = uuid();
    await writeFile(indexFilePath, `${findings.lines.join("\n")}\n${stringifyCacheLine({
      ...newConfig,
      hash,
      migrationsPath: migrationsPath.split("/")[0] !== ""
        ? `${join(projectRoot, migrationsPath)}`
        : newConfig.migrationsPath,
    })}`);
    await writeFile(join(cacheDirPath, hash), "");
  } else {
    if (!foundConfig(findings)) {
      console.error(`No projects exist with name '${projectName}" under this directory`);
      return;
    }
    const newConfig = { ...findings.config, ...proposedConfig };
    await writeFile(indexFilePath, [
      ...findings.lines.slice(0, findings.matchIndex),
      stringifyCacheLine({
        ...newConfig,
        migrationsPath: newConfig.migrationsPath.split("/")[0] !== ""
          ? `${join(newConfig.projectRoot, newConfig.migrationsPath)}`
          : newConfig.migrationsPath,
      }),
      ...findings.lines.slice(findings.matchIndex + 1),
    ].join("\n"));
  }
};

const getIndexFile = async () => {
  try {
    return (await readFile(indexFilePath)).trim();
  } catch (e) {
    const elements = cacheDirName.split("/");
    for (let i = 0; i < elements.length; i += 1) {
      const dirs = (await exec(`ls -1a -a ${join(cacheDirRoot, ...elements.slice(0, i))}`))
        .split("\n")
        .map(e => e.trim());
      if (!dirs.includes(elements[i])) {
        await mkdir(join(cacheDirRoot, ...elements.slice(0, i + 1)));
      }
    }

    await writeFile(indexFilePath, "");
    return "";
  }
};

const parseCacheLine = (line: string): Partial<Config> => {
  const [hash, details] = line.split(hashSeparator);
  const [
    projectName,
    projectRoot,
    migrationsPath,
    envFile,
    neo4jAddress,
    neo4jDatabase,
    neo4jUsername,
    k8sContext,
    k8sNamespace,
    k8sPod,
  ] = details.split(separator);
  return fromPairs(toPairs({
    hash,
    projectRoot,
    projectName,
    migrationsPath,
    envFile,
    neo4jAddress,
    neo4jDatabase,
    neo4jUsername,
    k8sContext,
    k8sNamespace,
    k8sPod,
  }).filter(([, value]) => value !== undefined && value !== ""));
};

const stringifyCacheLine = ({
  hash,
  projectRoot = process.cwd(),
  projectName,
  migrationsPath,
  envFile,
  neo4jAddress,
  neo4jDatabase,
  neo4jUsername,
  k8sContext,
  k8sNamespace,
  k8sPod,
}: Partial<Config>) => [
  hash,
  [
    projectName,
    projectRoot,
    migrationsPath,
    envFile || "",
    neo4jAddress || "",
    neo4jDatabase || "",
    neo4jUsername || "",
    k8sContext || "",
    k8sNamespace || "",
    k8sPod || "",
  ].join(separator),
].join(hashSeparator);

type Findings = {
  config: Partial<Config> | null;
  lines: string[];
  matchIndex: number;
};

const findConfig = async (projectName: string): Promise<Findings> => {
  const file = await getIndexFile();
  const lines = file.split("\n");
  const matchLines = lines.filter(line => line.match(`${hashSeparator}${projectName}${separator}`));
  if (matchLines.length === 0) {
    return { config: null, lines, matchIndex: -1 };
  }
  return { config: parseCacheLine(matchLines[0]), lines, matchIndex: lines.indexOf(matchLines[0]) };
};

type SuccessfulFindings = {
  config: Config;
  lines: string[];
  matchIndex: number;
};

const foundConfig = (findings: Findings): findings is SuccessfulFindings => Boolean(findings.config && findings.lines && findings.matchIndex !== -1);
