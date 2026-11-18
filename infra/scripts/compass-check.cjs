// Run on the Windows host, not in a container, to exercise Compass's network path.
const mongoose = require('mongoose');

async function main() {
  const port = process.env.MONGO_HOST_PORT || '27017';
  const uri = `mongodb://127.0.0.1:${port}/phd_quest?replicaSet=rs0&directConnection=true`;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    await mongoose.connection.db.admin().ping();
    if (hello.setName !== 'rs0' || !hello.isWritablePrimary)
      throw new Error('Expected writable rs0 primary');
    console.log('PASS: Windows host MongoDB connection, ping and rs0 primary via Compass URI.');
  } finally {
    await mongoose.disconnect();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
