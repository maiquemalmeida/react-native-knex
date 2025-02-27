// SQLite3: Column Builder & Compiler
// -------
const inherits = require('inherits')
const SchemaCompiler = require('../../../schema/compiler')

const some = require('lodash.some')

// Schema Compiler
// -------

function SchemaCompiler_SQLite3() {
  SchemaCompiler.apply(this, arguments);
}

inherits(SchemaCompiler_SQLite3, SchemaCompiler);

// Compile the query to determine if a table exists.
SchemaCompiler_SQLite3.prototype.hasTable = function (tableName) {
  const sql =
    `select * from sqlite_master ` +
    `where type = 'table' and name = ${this.formatter.parameter(tableName)}`;
  this.pushQuery({ sql, output: (resp) => resp.length > 0 });
};

// Compile the query to determine if a column exists.
SchemaCompiler_SQLite3.prototype.hasColumn = function (tableName, column) {
  this.pushQuery({
    sql: `PRAGMA table_info(${this.formatter.wrap(tableName)})`,
    output(resp) {
      return some(resp, (col) => {
        return (
          this.client.wrapIdentifier(col.name.toLowerCase()) ===
          this.client.wrapIdentifier(column.toLowerCase())
        );
      });
    },
  });
};

// Compile a rename table command.
SchemaCompiler_SQLite3.prototype.renameTable = function (from, to) {
  this.pushQuery(
    `alter table ${this.formatter.wrap(from)} rename to ${this.formatter.wrap(
      to
    )}`
  );
};

module.exports = SchemaCompiler_SQLite3;
