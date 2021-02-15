import { Config, readCacheIndex, readFromCacheIndex, removeFromCacheIndex, writeToCacheIndex } from "./cache-index";
import {
  appendMigrationToCache,
  confirmProceedWithoutDeletedMigrations,
  execCypher,
  getAppliedMigrations,
  getExistingMigrationNames,
  getMigration,
  popMigrationFromCache,
} from "./migrations";
import { getArgv } from "./get-argv";
import { getEnvVars, toPrettyFormat } from "./constants";

(async() => {
  const argv = await getArgv();
  if (!argv) return;
  // Config
  switch (argv.command) {
    case "init": {
      await writeToCacheIndex("init", argv as Config);
      return;
    }
    case "set": {
      await writeToCacheIndex("set", argv as Config);
      return;
    }
    case "ls": {
      const configs = await readCacheIndex();
      for (let i = 0; i < configs.length; i += 1) {
        const config = configs[i];
        console.log(`${config.projectName}`);
        console.log(` - project-root: ${config.projectRoot}`);
        console.log(` - migrations-path: ${config.migrationsPath}`);
      }
      return;
    }
    case "rm": {
      await removeFromCacheIndex(argv.projectName);
      return;
    }
    case "describe": {
      const config = await readFromCacheIndex(argv.projectName);
      if (!config) return;
      if (config.projectRoot) console.log(` - project-root: ${config.projectRoot}`);
      if (config.migrationsPath) console.log(` - migrations-path: ${config.migrationsPath}`);
      if (config.envFile) console.log(` - env-file: ${config.envFile}`);
      if (config.neo4jAddress) console.log(` - neo4j-address: ${config.neo4jAddress}`);
      if (config.neo4jDatabase) console.log(` - neo4j-database: ${config.neo4jDatabase}`);
      if (config.neo4jUsername) console.log(` - neo4j-username: ${config.neo4jUsername}`);
      if (config.k8sContext) console.log(` - k8s-context: ${config.k8sContext}`);
      if (config.k8sNamespace) console.log(` - k8s-namespace: ${config.k8sNamespace}`);
      if (config.k8sPod) console.log(` - k8s-pod: ${config.k8sPod}`);
      return;
    }
    default: {
      break;
    }
  }

  const preConfig = await readFromCacheIndex(argv.projectName);
  if (!preConfig) {
    console.log(`no project found with name '${argv.projectName}"`);
    return;
  }

  const envVars = await getEnvVars(argv.envFile || preConfig.envFile);
  const config = { ...envVars, ...preConfig, ...argv };

  const appliedMigrations = await getAppliedMigrations(config);
  const origin = appliedMigrations.map(({ name }) => name);
  const head = await getExistingMigrationNames(config);
  if (!origin || !head) return;

  const shared: string[] = [];

  for (let i = 0; i < Math.min(origin.length, head.length); i += 1) {
    if (origin[i] === head[i]) {
      shared.push(origin[i]);
    } else {
      break;
    }
  }

  const missing = head.filter(migrationName => !origin.includes(migrationName) && (origin.length === 0 || migrationName < origin[origin.length - 1]));
  const deleted = origin.filter(migrationName => !head.includes(migrationName));
  const unapplied = head.filter(migrationName => !origin.includes(migrationName) && (origin.length === 0 || migrationName > origin[origin.length - 1]));

  // Migration queries
  switch (argv.command) {
    case "status": {
      if (origin.length === 0 && head.length === 0) {
        console.log("no migrations applied yet");
        return;
      }
      const prettyFormat = toPrettyFormat(Math.max("Origin".length, ...origin.map(migrationName => migrationName.length)));
      console.log(prettyFormat("Origin", "Head"));
      for (let i = origin.length - 1, j = head.length - 1; i >= 0 || j >= 0;) {
        const originCommit = origin[i];
        const headCommit = head[j];
        if (originCommit > headCommit || j < 0) {
          console.log(prettyFormat(originCommit || "", ""));
          i -= 1;
        } else if (originCommit < headCommit || i < 0) {
          console.log(prettyFormat("", headCommit || ""));
          j -= 1;
        } else {
          console.log(prettyFormat(originCommit, headCommit));
          i -= 1;
          j -= 1;
        }
      }
      return;
    }
    case "version": {
      if (origin.length > 0) {
        console.log(origin[origin.length - 1]);
      } else {
        console.log("no migrations applied yet");
      }
      return;
    }
    default: {
      break;
    }
  }

  if (!argv.dryRun) {
    const proceed = await confirmProceedWithoutDeletedMigrations(deleted, config);
    if (!proceed) return;
  }

  // Migration mutations
  switch (argv.command) {
    case "up": {
      const migrationNames = (argv.includeMissing ? [...missing, ...unapplied] : unapplied).filter(Boolean);
      if (migrationNames.length === 0) {
        console.log("up to date");
      } else if (argv.dryRun) {
        for (let i = 0; i < migrationNames.length; i += 1) {
          console.log(`Would apply ${migrationNames[i]}`);
        }
      } else {
        const migrations = await Promise.all(migrationNames.map(migrationName => getMigration(migrationName, config)));
        for (let i = 0; i < migrationNames.length; i += 1) {
          const name = migrationNames[i];
          const migration = migrations[i];
          process.stdout.write(`Applying ${name}... `);
          try {
            await execCypher(migration, "up", config);
          } catch (error) {
            console.log();
            console.error(error.message);
            return;
          }
          appendMigrationToCache({ name, ...migration }, config);
          console.log("OK");
        }
      }
      return;
    }
    case "up-by-one": {
      const migrationNames = (argv.includeMissing ? [...missing, unapplied[0]] : unapplied.slice(0, 1)).filter(Boolean);
      if (migrationNames.length === 0) {
        console.log("up to date");
      } else if (argv.dryRun) {
        for (let i = 0; i < migrationNames.length; i += 1) {
          console.log(`Would apply ${migrationNames[i]}`);
        }
      } else {
        const migrations = await Promise.all(migrationNames.map(migrationName => getMigration(migrationName, config)));
        for (let i = 0; i < migrationNames.length; i += 1) {
          const name = migrationNames[i];
          const migration = migrations[i];
          process.stdout.write(`Applying ${name}... `);
          try {
            await execCypher(migration, "up", config);
          } catch (error) {
            console.log();
            console.error(error.message);
          }
          appendMigrationToCache({ name, ...migration }, config);
          console.log("OK");
        }
      }
      return;
    }
    case "up-to": {
      let migrationNames = (argv.includeMissing ? [...missing, ...unapplied] : unapplied).filter(Boolean);
      migrationNames = migrationNames.slice(
        0,
        migrationNames.indexOf(argv.version) !== -1
          ? migrationNames.indexOf(argv.version) + 1
          : migrationNames.length,
      );
      if (!migrationNames.includes(argv.version) && !origin.includes(argv.version)) {
        console.error(`${argv.version} is not a known migration to apply up to`);
      } else if (migrationNames.length === 0 || origin.includes(argv.version)) {
        console.log("up to date");
      } else if (argv.dryRun) {
        for (let i = 0; i < migrationNames.length; i += 1) {
          console.log(`Would apply ${migrationNames[i]}`);
        }
      } else {
        const migrations = await Promise.all(migrationNames.map(migrationName => getMigration(migrationName, config)));
        for (let i = 0; i < migrationNames.length; i += 1) {
          const name = migrationNames[i];
          const migration = migrations[i];
          process.stdout.write(`Applying ${name}... `);
          try {
            await execCypher(migration, "up", config);
          } catch (error) {
            console.log();
            console.error(error.message);
          }
          appendMigrationToCache({ name, ...migration }, config);
          console.log("OK");
        }
      }
      return;
    }
    case "down": {
      const migrations = appliedMigrations.slice(appliedMigrations.length - 1);
      const migrationNames = migrations.map(({ name }) => name);
      if (migrationNames.length === 0) {
        console.log("up to date");
      } else if (argv.dryRun) {
        for (let i = migrationNames.length - 1; i >= 0; i -= 1) {
          console.log(`Would rollback ${migrationNames[i]}`);
        }
      } else {
        for (let i = migrationNames.length - 1; i >= 0; i -= 1) {
          const name = migrationNames[i];
          const migration = migrations[i];
          process.stdout.write(`Rolling back ${name}... `);
          try {
            await execCypher(migration, "down", config);
          } catch (error) {
            console.log();
            console.error(error.message);
          }
          popMigrationFromCache(config);
          console.log("OK");
        }
      }
      return;
    }
    case "down-to": {
      let migrations = appliedMigrations;
      migrations = migrations.slice(
        migrations.findIndex(({ name }) => name === argv.version) !== -1
          ? migrations.findIndex(({ name }) => name === argv.version)
          : 0,
        migrations.length,
      );
      const migrationNames = migrations.map(({ name }) => name);
      if (!migrationNames.includes(argv.version) && !unapplied.includes(argv.version)) {
        console.error(`${argv.version} is not a known migration to apply down to`);
      } else if (migrationNames.length === 0 || unapplied.includes(argv.version)) {
        console.log("up to date");
      } else if (argv.dryRun) {
        for (let i = migrationNames.length - 1; i >= 1; i -= 1) {
          console.log(`Would rollback ${migrationNames[i]}`);
        }
      } else {
        const migrations = appliedMigrations;
        for (let i = migrationNames.length - 1; i >= 1; i -= 1) {
          const name = migrationNames[i];
          const migration = migrations[i];
          process.stdout.write(`Rolling back ${name}... `);
          try {
            await execCypher(migration, "down", config);
          } catch (error) {
            console.log();
            console.error(error.message);
          }
          popMigrationFromCache(config);
          console.log("OK");
        }
      }
      return;
    }
    case "redo": {
      const migrationNames = (argv.includeMissing ? [...missing, origin[origin.length - 1]] : origin.slice(origin.length - 1)).filter(Boolean);
      if (migrationNames.length === 0) {
        console.log("no migrations to redo");
      } else if (argv.dryRun) {
        for (let i = 0; i < migrationNames.length; i += 1) {
          console.log(`Would apply ${migrationNames[i]}`);
        }
      } else {
        const migrations = appliedMigrations;
        for (let i = 0; i < migrationNames.length; i += 1) {
          const name = migrationNames[i];
          const migration = migrations[i];
          process.stdout.write(`Applying ${name}... `);
          try {
            await execCypher(migration, "up", config);
          } catch (error) {
            console.log();
            console.error(error.message);
          }
          console.log("OK");
        }
      }
      return;
    }
    case "reset": {
      const migrations = appliedMigrations;
      const migrationNames = migrations.map(({ name }) => name);
      if (migrationNames.length === 0) {
        console.log("up to date");
      } else if (argv.dryRun) {
        for (let i = migrationNames.length - 1; i >= 0; i -= 1) {
          console.log(`Would rollback ${migrationNames[i]}`);
        }
      } else {
        for (let i = migrationNames.length - 1; i >= 0; i -= 1) {
          const name = migrationNames[i];
          const migration = migrations[i];
          process.stdout.write(`Rolling back ${name}... `);
          try {
            await execCypher(migration, "down", config);
          } catch (error) {
            console.log();
            console.error(error.message);
          }
          popMigrationFromCache(config);
          console.log("OK");
        }
      }
      return;
    }
    default: {
      break;
    }
  }
})();
