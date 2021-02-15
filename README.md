## cygoose

TL;DR: cygoose allows you to easily apply/rollback data migrations written in `.cypher` files to your Neo4j databases. It's based off of [goose](https://bitbucket.org/liamstask/goose)

Say we have a database that contains nodes with the `User` and `Group` labels, and we want to add a `UserGroup` label to all those nodes. We'd write out a migration file named something like `00101_AddUserGroupLabel.cypher` that specifies both the up (apply) and down (rollback) operations of our migration.
```cypher
// +cygoose Up
MATCH (n)
WHERE n:User OR n:Group
SET n:UserGroup

// +cygoose Down
MATCH (n:UserGroup)
REMOVE n:UserGroup
```
Migration filenames MUST follow the pattern `prefix_suffix.cypher` with the `_` being the important thing to note. Migration files can be nested within your migration directory and will be applied in alphabetical order by relative filepath to your migration directory.

### Install
To install `cygoose` on Mac, run the command below
```
wget -O /usr/local/bin/cygoose https://github.com/tlowerison/cygoose/releases/download/v1.0.1/cygoose-macos && chmod u+x /usr/local/bin/cygoose
```
Likewise, to install `cygoose` on Linux, run
```
wget -O /usr/local/bin/cygoose https://github.com/tlowerison/cygoose/releases/download/v1.0.1/cygoose-linux && chmod u+x /usr/local/bin/cygoose
```

### Usage
Setting up a project looks like this
```
cd path/to/project/root
mkdir db && mkdir db/migrations
cygoose init project_name db/migrations -e .env
```

Then to apply all of the migrations in `db/migrations` to our database, we just run
```
cygoose project_name up
```
To see the most recent migration applied, run
```
cygoose project_name version
> 00101_AddUserGroupLabel
```
If we decide we want to rollback the most recently applied migration, we can run
```
cygoose project_name down
```
If you want to remove the cygoose cache for this project, run this while inside your project
```
cygoose rm project_name
```

One thing to note is that cygoose reserves the `;` character for indexing so you shouldn't include it in any project names, file paths or other settings.

### k8s integration
cygoose also integrates with Kubernetes, allowing you to specify a desired context and a Neo4j pod to run migrations on (have only tested with the community edition deployed using Helm so far). Use the `--k8s-context` and `--k8s-pod` options when running `cygoose init/set` or, alternatively, specify a path to a `.env` file containing the `K8S_CONTEXT` and `K8S_POD` variables with the `-e` option.

### cygoose --help
```
Usage: cygoose <command> [options]

Commands:
  cygoose init <project-name> <migrations-path>  create a new project
  cygoose ls                                     list all projects by name
  cygoose rm <project-name>                      remove the cache
  cygoose <project-name> set                     set configurations for a project
  cygoose <project-name> describe                list all config settings
  cygoose <project-name> up                      migrate the DB to the most recent version available
  cygoose <project-name> up-by-one               migrate up by a single version
  cygoose <project-name> up-to [version]         migrate the DB to a specific version
  cygoose <project-name> down                    rollback the version by 1
  cygoose <project-name> down-to [version]       rollback to a specific version
  cygoose <project-name> redo                    re-run the latest migration
  cygoose <project-name> reset                   rollback all migrations
  cygoose <project-name> status                  dump the migration status for the current DB
  cygoose <project-name> version                 print the name of the most recent applied migration
```
