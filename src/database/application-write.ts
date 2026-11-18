import { ClientSession, Connection, mongo } from 'mongoose';

// Every application writer touches the same document inside its transaction.
// This prevents concurrent inserts from escaping a replace-all restore snapshot.
export async function applicationWrite<T>(
  connection: Connection,
  work: (session: ClientSession) => Promise<T>,
  options: mongo.TransactionOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await connection.transaction(
        async (session) => {
          await connection
            .collection<{ _id: string; revision: number }>('_application_control')
            .updateOne({ _id: 'writes' }, { $inc: { revision: 1 } }, { session, upsert: true });
          return work(session);
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, ...options },
      );
    } catch (error) {
      // The initial concurrent upsert can race before the control document exists.
      if (
        attempt < 2 &&
        error instanceof mongo.MongoServerError &&
        error.code === 11000 &&
        error.keyValue?._id === 'writes'
      )
        continue;
      throw error;
    }
  }
}

export async function applicationRevision(
  connection: Connection,
  session: ClientSession,
): Promise<number> {
  const record = await connection
    .collection<{ _id: string; revision: number }>('_application_control')
    .findOne({ _id: 'writes' }, { session });
  return record?.revision ?? 0;
}
