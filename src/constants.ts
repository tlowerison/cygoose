import childProcess from "child_process";
import { join } from "path";
import { fromPairs, has, toPairs } from "ramda";

export const cacheDirRoot = "~"
export const cacheDirName = ".cygoose";
export const cacheDirPath = join("~", cacheDirName);

export const exec = (command: string): Promise<string> => new Promise((resolve, reject) => childProcess.exec(
  command,
  (error, stdout, stderr) => error || stderr ? reject(error || stderr) : resolve(stdout),
));

export const getEnvVars = async (envFile: string | undefined) => {
  if (!envFile) return {};
  const lines = (await readFile(envFile)).split("\n");
  const values = {};
  for (let i = 0; i < lines.length - 1; i += 1) {
    const [key, ...value] = lines[i].split("=");
    values[key.trim()] = value.join("=").trim();
  }
  return fromPairs(toPairs({ ...process.env, ...values }).filter(([key]) => has(key, envVars)).map(([key, value]) => [envVars[key], value]));
};

export const indexFilePath = join(cacheDirPath, "index");

export const toPrettyFormat = (firstWidth: number) => (first: string, second: string) =>
  `${first}${new Array(firstWidth - first.length).fill(" ").join("")}  ${second}`;

const envVars = {
  K8S_CONTEXT: "k8sContext",
  K8S_NAMESPACE: "k8sNamespace",
  K8S_POD: "k8sPod",
  NEO4J_ADDRESS: "neo4jAddress",
  NEO4J_DATABASE: "neo4jDatabase",
  NEO4J_PASSWORD: "neo4jPassword",
  NEO4J_USERNAME: "neo4jUsername",
};

export const mkdir = (path: string) => exec(`mkdir ${path}`);

export const readdir = async (path: string) => {
  const contents = await exec(`ls -1a -a ${path}`);
  return contents.split("\n").map(e => e.trim());
}

export const readFile = (path: string) => exec(`cat ${path}`);

export const writeFile = (path: string, text: string) => exec(`cat <<EOF > ${path}\n${text.trim()}\nEOF`);
