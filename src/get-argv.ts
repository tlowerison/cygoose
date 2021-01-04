import yargs from "yargs/yargs";
import { exec, getEnvVars } from "./constants";
import { fromPairs, has, identity, omit, pipe, toPairs, unnest } from "ramda";
type Argv = ReturnType<typeof yargs>;

export const getArgv = async () => {
  let currentK8sContext: string | undefined;
  try {
    currentK8sContext = await exec("kubectl config current-context");
  } catch (error) {
    if (!(error instanceof Error)) {
      console.error(error);
      return null;
    }
  }

  let appliedYargs = yargs(process.argv.slice(2));
  let argv = appliedYargs
    .scriptName("cygoose")
    .version("1.0.0")
    .wrap(appliedYargs.terminalWidth())
    .usage("Usage: $0 <command> [options]")
    .command("init <project-name> <migrations-path>", "create a new project", initAndSetOptions(true))
    .command("ls", "list all projects by name")
    .command("rm <project-name>", "remove the cache")
    .command("<project-name> set", "set configurations for a project", initAndSetOptions(false))
    .command("<project-name> describe", "list all config settings")
    .command("<project-name> up", "migrate the DB to the most recent version available", pipe(dryRunOption, includeMissingOption, migrationOptions))
    .command("<project-name> up-by-one", "migrate up by a single version", pipe(dryRunOption, migrationOptions))
    .command("<project-name> up-to [version]", "migrate the DB to a specific version", pipe(versionPositional, dryRunOption, includeMissingOption, migrationOptions))
    .command("<project-name> down", "rollback the version by 1", pipe(dryRunOption, migrationOptions))
    .command("<project-name> down-to [version]", "rollback to a specific version", pipe(versionPositional, dryRunOption, includeMissingOption, migrationOptions))
    .command("<project-name> redo", "re-run the latest migration", pipe(dryRunOption, migrationOptions))
    .command("<project-name> reset", "rollback all migrations", pipe(dryRunOption, includeMissingOption, migrationOptions))
    .command("<project-name> status", "dump the migration status for the current DB", pipe(showMissingOnlyOption, migrationOptions))
    .command("<project-name> version", "print the name of the most recent applied migration", migrationOptions)
    .help()
    .argv as any;

  argv = fromPairs(toPairs({
    ...omit(
      unnest(aliases.map(({ inputs }) => inputs.map(({ key }) => key))),
      argv,
    ),
    ...fromPairs(
      aliases
        .filter(({ output }) => output)
        .map(({ inputs, output }) => [
          output,
          inputs.map(({ key, fn = identity }) => fn(argv[key])).find(value => value !== undefined)
        ] as [string, any]),
    ),
  }).filter(([, value]) => value !== undefined && value !== ""));
  const envVars = await getEnvVars(argv.envFile);
  if (has("k8sPod", argv)) {
    if (!argv.k8sContext && currentK8sContext) {
      argv.k8sContext = currentK8sContext.trim();
    } else if (!argv.k8sNamespace) {
      argv.k8sNamespace = "default";
    }
  }

  if (argv._.length === 1) {
    if (commands.includes(argv._[0])) {
      argv.command = argv._[0];
    } else {
      console.error(`unknown command '${argv._[0]}'`);
      return;
    }
  } else if (argv._.length > 1) {
    if (!commands.includes(argv._[0]) && commands.includes(argv._[1])) {
      argv.command = argv._[1];
      argv.projectName = argv._[0];
      if (argv._.length === 3) {
        argv.version = argv._[2];
      }
    } else {
      console.error(`unknown command '${argv._[1]}'`);
      return;
    }
  }
  return { ...envVars, ...omit(["_"], argv) } as any;
};

const includeMissingOption = (yargs: Argv) => yargs.option("include-missing", {
  describe: "include migrations that were missed",
  type: "boolean",
});

const dryRunOption = (yargs: Argv) => yargs.option("dry-run", {
  describe: "prints out the migrations it would apply and exits before applying them",
  type: "boolean",
});

const showMissingOnlyOption = (yargs: Argv) => migrationOptions(yargs.option("show-missing-only", {
  describe: "show only migrations that were applied but no longer exist in migrations path",
  type: "boolean",
}));

const versionPositional = (yargs: Argv) => yargs.positional("version", {
  describe: "filename of a specific migration",
  type: "string",
});

const initAndSetOptions = (isInitCommand: boolean) => (yargs: Argv) => {
  let appliedYargs = yargs;
  if (!isInitCommand) {
    appliedYargs = appliedYargs.option("migrations-path", {
      alias: "m",
      describe: "path to your migrations directory (ideally checked in to your project's git repo)",
      type: "string",
    });
  }
  appliedYargs = appliedYargs.option("env-file", {
    inputs: "e",
    describe: "specify a file with Neo4j environment variables",
    type: "string",
  });
  if (isInitCommand) appliedYargs = appliedYargs.env("NEO4J_ADDRESS");
  appliedYargs = appliedYargs.option("address", {
    alias: "a",
    describe: "address and port to connect to; can be specified by the env var NEO4J_ADDRESS",
    type: "string",
    default: isInitCommand ? "bolt://localhost:7687" : undefined,
  });
  if (isInitCommand) appliedYargs = appliedYargs.env("NEO4J_DATABASE");
  appliedYargs = appliedYargs.option("database", {
    alias: "d",
    describe: "database to connect to; can be specified by the env var NEO4J_DATABASE",
    type: "string",
  });
  if (isInitCommand) appliedYargs = appliedYargs.env("NEO4J_USERNAME");
  appliedYargs = appliedYargs.option("username", {
    alias: "u",
    describe: "username to connect as; can be specified by the env var NEO4J_USERNAME",
    type: "string",
  });
  if (isInitCommand) appliedYargs = appliedYargs.env("K8S_CONTEXT");
  appliedYargs = appliedYargs.option("k8s-context", {
    alias: "c",
    describe: "specify the k8s context to run migrations in; can be specified by the env var K8S_CONTEXT",
    type: "string",
  });
  if (isInitCommand) appliedYargs = appliedYargs.env("K8S_NAMESPACE");
  appliedYargs = appliedYargs.option("k8s-namespace", {
    alias: "n",
    describe: "specify the k8s namespace to run migrations in; can be specified by the env var K8S_NAMESPACE",
    type: "string",
  });
  if (isInitCommand) appliedYargs = appliedYargs.env("K8S_POD");
  appliedYargs = appliedYargs.option("k8s-pod", {
    alias: "p",
    describe: "specify the k8s pod holding your Neo4j db; can be specified by the env var K8S_POD",
    type: "string",
  })
};

const migrationOptions = (yargs: Argv) =>
  yargs
    .env("NEO4J_USERNAME")
    .option("username", {
      alias: "u",
      describe: "username to connect as; can be specified by the env var NEO4J_USERNAME",
      type: "string",
    })
    .env("NEO4J_PASSWORD")
    .option("password", {
      alias: "p",
      describe: "password to connect with; can be specified by the env var NEO4J_PASSWORD",
      type: "string",
    })
    .option("param", {
      alias: "P",
      describe: "add a parameter to this session. For example, -P \"number ⇒ 3\". This argument can be specified multiple times",
      type: "array",
    })
    .option("fail-fast", {
      describe: "exit and report failure on first error when reading from file",
      type: "boolean",
      default: true,
    })
    .option("fail-at-end", {
      describe: "exit and report failures at end of input when reading from file",
      type: "boolean",
    })
    .option("format", {
      describe: "desired output format",
      choices: ["auto", "verbose", "plain"],
    })
    .option("debug", {
      describe: "print additional debug information",
      type: "boolean",
    })
    .option("non-interactive", {
      describe: "force non-interactive mode; only useful if auto-detection fails (e.g. Windows)",
      type: "boolean",
    })
    .option("encryption", {
      describe: "whether the connection to Neo4j should be encrypted; must be consistent with Neo4j’s configuration",
      choices: ["true", "false", "default"],
      coerce: (value: "true" | "false" | "default"): boolean | "default" => value === "default" ? value : JSON.parse(value),
      default: "default",
    })
    .option("sample-rows", {
      describe: "number of rows sampled to compute table widths (only for format=verbose)",
      type: "number",
      default: 1000,
    })
    .option("wrap", {
      describe: "wrap table column values if column is too narrow (only for format=verbose)",
      type: "boolean",
      default: true,
    });

type Alias = {
  output?: string;
  inputs: {
    key: string;
    fn?: (...args: any[]) => string;
  }[];
};

const aliases: Alias[] = [
  {
    inputs: [
      { key: "$0" },
    ],
  },
  {
    output: "dryRun",
    inputs: [
      { key: "dry-run" },
      { key: "d" },
    ],
  },
  {
    output: "envFile",
    inputs: [
      { key: "env-path" },
      { key: "e" },
    ],
  },
  {
    output: "failAtEnd",
    inputs: [
      { key: "fail-at-end" },
    ],
  },
  {
    output: "failFast",
    inputs: [
      { key: "fail-fast" },
    ],
  },
  {
    output: "includeMissing",
    inputs: [
      { key: "include-missing" },
    ],
  },
  {
    output: "k8sContext",
    inputs: [
      { key: "k8s-context" },
      { key: "c" },
    ],
  },
  {
    output: "k8sNamespace",
    inputs: [
      { key: "k8s-namespace" },
      { key: "n" },
    ],
  },
  {
    output: "k8sPod",
    inputs: [
      { key: "k8s-pod" },
      { key: "p" },
    ],
  },
  {
    output: "migrationsPath",
    inputs: [
      { key: "migrations-path" },
      { key: "m" },
    ],
  },
  {
    output: "neo4jAddress",
    inputs: [
      { key: "address" },
      { key: "a" },
    ],
  },
  {
    output: "neo4jDatabase",
    inputs: [
      { key: "database" },
      { key: "d" },
    ],
  },
  {
    output: "neo4jPassword",
    inputs: [
      { key: "username" },
      { key: "p" },
    ],
  },
  {
    output: "neo4jUsername",
    inputs: [
      { key: "username" },
      { key: "u" },
    ],
  },
  {
    output: "nonInteractive",
    inputs: [
      { key: "non-interactive" },
    ],
  },
  {
    output: "param",
    inputs: [
      { key: "P" },
    ],
  },
  {
    output: "projectName",
    inputs: [
      { key: "project-name" },
    ],
  },
  {
    output: "sampleRows",
    inputs: [
      { key: "sample-rows" },
    ],
  },
  {
    output: "showMissingOnly",
    inputs: [
      { key: "show-missing-only" },
    ],
  },
];

const commands = ["init", "set", "ls", "rm", "describe", "up", "up-by-one", "up-to", "down", "down-to", "redo", "reset",  "status", "version"];
