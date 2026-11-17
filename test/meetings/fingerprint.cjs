// Read-only: output hashes and counts, never research content.
const mongoose = require('mongoose'), { createHash } = require('node:crypto');
(async () => {
  const connection = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  try {
    const result = { database: connection.name, collections: {} };
    for (const { name } of await connection.db.listCollections().toArray()) {
      const records = await connection.db.collection(name).find().sort({ _id: 1 }).toArray();
      result.collections[name] = { count: records.length, sha256: createHash('sha256').update(JSON.stringify(records)).digest('hex') };
    }
    console.log(JSON.stringify(result));
  } finally { await connection.close(); }
})().catch(() => { console.error('Read-only data fingerprint failed.'); process.exitCode = 1; });
