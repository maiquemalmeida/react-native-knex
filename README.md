# [knex.js](http://knexjs.org)


**This is a port to react-native. Require `react-native-sqlite-storage`
to be installed and configured first.**

> **A SQL query builder that is _flexible_, _portable_, and _fun_ to use!**


- [transactions](http://knexjs.org/#Transactions)
- both a [promise](http://knexjs.org/#Interfaces-Promises) and [callback](http://knexjs.org/#Interfaces-Callbacks) API

[Read the full documentation to get started!](http://knexjs.org)

We have several examples [on the website](http://knexjs.org)

## Run on React Native
1. add ```"react-native-sqlite-storage": "https://github.com/maiquemalmeida/react-native-sqlite-storage"```
2. add ```"react-native-knex": "https://github.com/maiquemalmeida/react-native-sqlite-storage"```
```js
import factory, { setSQLiteDebug } from "react-native-sqlite-storage";
import Knex, { NativeClient } from "react-native-knex";

export const knex = Knex(new NativeClient({
  debug: true,
  connection: {
    filename: "database.sqlite"
  }
}, factory))

// Create a table

await knex.schema.createTable('users', (table) => {
  table.increments('id');
  table.string('userName');
})

// ...and another
await knex.schema.createTable('accounts', function(table) {
  table.increments('id');
  table.string('accountName');
  table.integer('userId').unsigned().references('users.id');
})

// Then query the table...
const rows = await knex.insert({user_name: 'Tim'}).into('users');
// ...and using the insert id, insert into the other table.
await knex.table('accounts').insert({account_name: 'knex', user_id: rows[0]})
const users = await knex("users")
  .join("accounts", "users.id", "accounts.userId")
  .select("users.userName as user", "accounts.accountName as account");
```
