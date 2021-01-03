import { Config } from "./cache-index";
import { cacheDirPath, exec, readdir, readFile, writeFile } from "./constants";
import { createInterface } from "readline";
import { join } from "path";
import { map } from "ramda";

const migrationNamePrefix = "!cygoose:";

export const getAppliedMigrations = async (config: Config) => (await getHashFile(config.hash)).split(migrationNamePrefix).slice(1).map(e => {
  const [name, ...lines] = e.split("\n");
  return { name, ...getMigrationFromText(lines.join("\n").trim()) };
});

export const getExistingMigrationNames = async (config: Config) => {
  try {
    const filenames = await readdir(config.migrationsPath);
    return filenames
      .filter(filename => filename.slice(filename.length - cypherExtension.length) === cypherExtension)
      .map(trimCypherExtension);
  } catch (e) {
    console.error(`no such directory '${config.migrationsPath}'`);
    return null;
  }
};

export const appendMigrationToCache = async (inputMigration: { name: string; up: string; down: string }, config: Config) => {
  const hashFile = await getHashFile(config.hash);
  await writeFile(
    getHashFilename(config.hash),
    `${hashFile.length > 0 ? `${hashFile}\n\n` : ""}${
      migrationNamePrefix
    }${
      inputMigration.name
    }\n// +cygoose Up\n${
      inputMigration.up
    }\n// +cygoose Down\n${
      inputMigration.down
    }`,
  );
};

export const popMigrationFromCache = async (config: Config) => {
  const migrations = (await getHashFile(config.hash)).split(migrationNamePrefix);
  if (migrations.length > 0) {
    await writeFile(getHashFilename(config.hash), migrations.slice(0, migrations.length - 1).join(migrationNamePrefix));
  }
};

export const removeMigrationsFromCache = async (inputMigrationNames: string[], config: Config) => {
  const migrations = (await getHashFile(config.hash)).split(migrationNamePrefix);
  await writeFile(
    getHashFilename(config.hash),
    migrations
      .map(migration => migration.split("\n"))
      .filter(([migrationName]) => !inputMigrationNames.includes(migrationName))
      .map(migrationLines => migrationLines.join("\n"))
      .join("migrationNamePrefix"),
  );
};

export const confirmProceedWithoutDeletedMigrations = async (deleted: string[], config: Config) => {
  if (deleted.length > 0) {
    console.log("Some applied migrations have been deleted from your project:");
    for (let i = 0; i < deleted.length; i += 1) {
      console.log(` - ${deleted[i]}`);
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const response = await new Promise<string>(resolve => rl.question(
      "Do you want to proceed with this operation? (y/n) (proceeding will remove them from tracking) ",
      (answer: string) => {
        resolve(answer);
        rl.close();
      },
    ));
    const proceed = response.trim().toLowerCase() === "y";
    if (proceed) {
      removeMigrationsFromCache(deleted, config);
    }
    return proceed;
  }
  return true;
};

export const getMigration = async (migrationName: string, config: Config): Promise<{ up: string; down: string }> =>
  getMigrationFromText(await readFile(join(config.migrationsPath, `${migrationName}.cypher`)));

const getMigrationFromText = (text: string): { up: string; down: string } => {
  const lines = text.split("\n");
  const lineStates = { up: [] as number[], down: [] as number[] };
  let state: keyof typeof lineStates | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] === "// +cygoose Up") {
      state = "up";
    } else if (lines[i] === "// +cygoose Down") {
      state = "down";
    } else {
      if (state === null) {
        throw  new Error(`migration includes code not prefixed by a cygoose annotation: ${lines[i]}`);
      }
      lineStates[state].push(i);
    }
  } // @ts-ignore
  return map(lineNums => lineNums.map(lineNum => lines[lineNum]).join("\n").trim(), lineStates);
};

export const execCypher = async (
  cypher: string,
  {
    k8sContext,
    k8sNamespace,
    k8sPod,
    neo4jAddress,
    neo4jDatabase,
    neo4jPassword,
    neo4jUsername,
  }: Config,
) => {
  if (!neo4jPassword) {
    console.error("must provide password parameter");
    throw new Error("");
  }
  const operation = `cypher-shell ${
    neo4jAddress ? `-a '${neo4jAddress.split(`'`).join(`\\'`)}'` : ""
  } ${
    neo4jDatabase ? `-d '${neo4jDatabase.split(`'`).join(`\\'`)}'` : ""
  } -u '${
    neo4jUsername.split(`'`).join(`\\'`)
  }' -p '${
    neo4jPassword.split(`'`).join(`\\'`)
  }' "${
    cypher.split(`"`).join(`\\"`).split(`$`).join(`\\$`)
  }"`;
  if (k8sContext && k8sNamespace && k8sPod) {
    const currentK8sContext = await exec(`kubectl config current-context`);
    if (currentK8sContext !== k8sContext) {
      await exec(`kubectl config use-context ${k8sContext}`);
    }
    await exec(`kubectl exec ${k8sPod} --namespace ${k8sNamespace} -- ./bin/${operation}`);
  } else {
    await exec(operation);
  }
};

const cypherExtension = ".cypher";

const getHashFile = async (hash: string) => (await readFile(getHashFilename(hash))).trim();

const getHashFilename = (hash: string) => join(cacheDirPath, hash);

const trimCypherExtension = (string: string) => string.slice(0, string.length - cypherExtension.length);
