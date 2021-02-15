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
First install `cypher-shell` on your machine from either the [Neo4j download center](https://neo4j.com/download-center/#cyphershell) or using `brew install cypher-shell`. (Note: `cypher-shell` requires a Java Runtime to be installed as well, downloads can be found at the [Java download center](https://www.java.com/en/download/manual.jsp)).
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

### Nuances
- cygoose reserves the `;` character for indexing so you shouldn't include it in any project names, file paths or other settings.
- `cypher-shell` can only execute one Cypher statement at a time, so combining multiple statements into one migration means that each statement will be executed independently and sequentially. This is kind of a major bummer because it kills any notion of a transaction across these separate statements, but it's not an issue as long as we order the statements in our migrations correctly. Basically if you have an up migration that looks like this (note the syntax error in the second statement):
```cypher
// +cygoose Up
MATCH (n { uuid: '123' })
SET n.name = 'Foo';

MATCH (n { uuid: 'abc' })
SET n.name = 'Alice';

MATCH (n { uuid: 'def' })
SET n.name 'Bob';

MATCH (n { uuid: 'ghi' })
SET n.name = 'Eve';
```
We should add down migration statements in the opposite order so that we can fail gracefully (to a degree) and undo partial edits.
```cypher
// +cygoose Down
MATCH (n { uuid: 'ghi' })
SET n.name = 'ghi';

MATCH (n { uuid: 'def' })
SET n.name = 'def';

MATCH (n { uuid: 'abc' })
SET n.name = 'abc';

MATCH (n { uuid: '123' })
SET n.name = '123';
```
When the second up statement fails, `cygoose` will rollback the up statement by picking up from the third down statement and executing all remaining down statements (i.e. the 3rd and 4th down statements).

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
