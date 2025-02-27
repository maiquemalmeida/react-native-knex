// Column Compiler
// Used for designating column definitions
// during the table "create" / "alter" statements.
// -------
const Raw = require('../raw')
const { pushQuery, pushAdditional, unshiftQuery } = require('./helpers')
const groupBy = require('lodash.groupby')
const first = require('lodash.first')
const has = require('lodash.has')
const tail = require('lodash.tail')
const { isObject } = require('../util/is')
const { escapeBinding } = require('../query/string')

function ColumnCompiler(client, tableCompiler, columnBuilder) {
  this.client = client;
  this.tableCompiler = tableCompiler;
  this.columnBuilder = columnBuilder;
  this._commonBuilder = this.columnBuilder;
  this.args = columnBuilder._args;
  this.type = columnBuilder._type.toLowerCase();
  this.grouped = groupBy(columnBuilder._statements, 'grouping');
  this.modified = columnBuilder._modifiers;
  this.isIncrements = this.type.indexOf('increments') !== -1;
  this.formatter = client.formatter(columnBuilder);
  this.sequence = [];
  this.modifiers = [];
}

ColumnCompiler.prototype.pushQuery = pushQuery;

ColumnCompiler.prototype.pushAdditional = pushAdditional;

ColumnCompiler.prototype.unshiftQuery = unshiftQuery;

ColumnCompiler.prototype._defaultMap = {
  columnName: function () {
    if (!this.isIncrements) {
      throw new Error(
        `You did not specify a column name for the ${this.type} column.`
      );
    }
    return 'id';
  },
};

ColumnCompiler.prototype.defaults = function (label) {
  if (Object.prototype.hasOwnProperty.call(this._defaultMap, label)) {
    return this._defaultMap[label].bind(this)();
  } else {
    throw new Error(
      `There is no default for the specified identifier ${label}`
    );
  }
};

// To convert to sql, we first go through and build the
// column as it would be in the insert statement
ColumnCompiler.prototype.toSQL = function () {
  this.pushQuery(this.compileColumn());
  if (this.sequence.additional) {
    this.sequence = this.sequence.concat(this.sequence.additional);
  }
  return this.sequence;
};

// Compiles a column.
ColumnCompiler.prototype.compileColumn = function () {
  return (
    this.formatter.wrap(this.getColumnName()) +
    ' ' +
    this.getColumnType() +
    this.getModifiers()
  );
};

// Assumes the autoincrementing key is named `id` if not otherwise specified.
ColumnCompiler.prototype.getColumnName = function () {
  const value = first(this.args);
  return value || this.defaults('columnName');
};

ColumnCompiler.prototype.getColumnType = function () {
  const type = this[this.type];
  return typeof type === 'function' ? type.apply(this, tail(this.args)) : type;
};

ColumnCompiler.prototype.getModifiers = function () {
  const modifiers = [];

  for (let i = 0, l = this.modifiers.length; i < l; i++) {
    const modifier = this.modifiers[i];

    //Cannot allow 'nullable' modifiers on increments types
    if (!this.isIncrements || (this.isIncrements && modifier === 'comment')) {
      if (has(this.modified, modifier)) {
        const val = this[modifier].apply(this, this.modified[modifier]);
        if (val) modifiers.push(val);
      }
    }
  }

  return modifiers.length > 0 ? ` ${modifiers.join(' ')}` : '';
};

// Types
// ------

ColumnCompiler.prototype.increments =
  'integer not null primary key autoincrement';
ColumnCompiler.prototype.varchar = function (length) {
  return `varchar(${this._num(length, 255)})`;
};
ColumnCompiler.prototype.text = 'text';
ColumnCompiler.prototype.decimal = function (precision, scale) {
  if (precision === null) {
    throw new Error(
      'Specifying no precision on decimal columns is not supported for that SQL dialect.'
    );
  }
  return `decimal(${this._num(precision, 8)}, ${this._num(scale, 2)})`;
};
ColumnCompiler.prototype.binary = 'blob';
ColumnCompiler.prototype.bool = 'integer';
ColumnCompiler.prototype.date = 'date';
ColumnCompiler.prototype.datetime = 'datetime';
ColumnCompiler.prototype.time = 'time';
ColumnCompiler.prototype.timestamp = 'timestamp';
ColumnCompiler.prototype.enu = 'varchar';
ColumnCompiler.prototype.integer = 'integer';

ColumnCompiler.prototype.uuid = 'char(36)';
ColumnCompiler.prototype.specifictype = (type) => type;

// Modifiers
// -------

ColumnCompiler.prototype.nullable = (nullable) =>
  nullable === false ? 'not null' : 'null';
ColumnCompiler.prototype.notNullable = function () {
  return this.nullable(false);
};
ColumnCompiler.prototype.defaultTo = function (value) {
  if (value === void 0) {
    return '';
  } else if (value === null) {
    value = 'null';
  } else if (value instanceof Raw) {
    value = value.toQuery();
  } else if (this.type === 'bool') {
    if (value === 'false') value = 0;
    value = `'${value ? 1 : 0}'`;
  } else if (
    (this.type === 'json') &&
    isObject(value)
  ) {
    value = `'${JSON.stringify(value)}'`;
  } else {
    value = escapeBinding(value.toString());
  }
  return `default ${value}`;
};
ColumnCompiler.prototype._num = function (val, fallback) {
  if (val === undefined || val === null) return fallback;
  const number = parseInt(val, 10);
  return isNaN(number) ? fallback : number;
};

module.exports = ColumnCompiler;
