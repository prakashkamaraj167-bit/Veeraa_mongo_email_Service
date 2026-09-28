import { MongoClient, Db } from "mongodb";
import type { Database, User, Session, Product, Order, WishlistRecord, Feedback, PasswordReset } from "./server";

let client: MongoClient | null = null;
let mongoDb: Db | null = null;
let isConnected = false;
let connectionError: string | null = null;
let activeDbName: string = (process.env.DB_NAME || "veeraa").toLowerCase();

async function loadDataFromDb(dbInstance: Db, initialData: Database): Promise<Database> {
  const loadedData: Database = { ...initialData };

  // 1. Products
  const prodCol = dbInstance.collection<Product>("products");
  const prodCount = await prodCol.countDocuments();
  if (prodCount === 0 && initialData.products.length > 0) {
    console.log(`[MongoDB] Seeding ${initialData.products.length} initial products to Atlas...`);
    await prodCol.insertMany(initialData.products);
    loadedData.products = initialData.products;
  } else {
    const prods = await prodCol.find({}).toArray();
    loadedData.products = prods.map(({ _id, ...rest }: any) => rest as Product);
    console.log(`[MongoDB] Loaded ${loadedData.products.length} products from Atlas.`);
  }

  // 2. Users
  const userCol = dbInstance.collection<User>("users");
  const userCount = await userCol.countDocuments();
  if (userCount === 0 && initialData.users.length > 0) {
    console.log(`[MongoDB] Seeding initial users to Atlas...`);
    await userCol.insertMany(initialData.users);
    loadedData.users = initialData.users;
  } else {
    const users = await userCol.find({}).toArray();
    loadedData.users = users.map(({ _id, ...rest }: any) => rest as User);
    console.log(`[MongoDB] Loaded ${loadedData.users.length} users from Atlas.`);
  }

  // 3. Sessions
  const sessCol = dbInstance.collection<Session>("sessions");
  const sessDocs = await sessCol.find({}).toArray();
  loadedData.sessions = sessDocs.map(({ _id, ...rest }: any) => rest as Session);

  // 4. Orders
  const orderCol = dbInstance.collection<Order>("orders");
  const orderDocs = await orderCol.find({}).toArray();
  loadedData.orders = orderDocs.map(({ _id, ...rest }: any) => rest as Order);
  console.log(`[MongoDB] Loaded ${loadedData.orders.length} orders from Atlas.`);

  // 5. Wishlists
  const wishCol = dbInstance.collection<WishlistRecord>("wishlists");
  const wishDocs = await wishCol.find({}).toArray();
  loadedData.wishlists = wishDocs.map(({ _id, ...rest }: any) => rest as WishlistRecord);

  // 6. Feedback
  const fbCol = dbInstance.collection<Feedback>("feedback");
  const fbDocs = await fbCol.find({}).toArray();
  loadedData.feedback = fbDocs.map(({ _id, ...rest }: any) => rest as Feedback);

  // 7. Password Resets
  const prCol = dbInstance.collection<PasswordReset>("password_resets");
  const prDocs = await prCol.find({}).toArray();
  loadedData.password_resets = prDocs.map(({ _id, ...rest }: any) => rest as PasswordReset);

  return loadedData;
}

export async function connectMongo(initialData: Database): Promise<{
  connected: boolean;
  dbName: string;
  data: Database;
}> {
  const mongoUrl = process.env.MONGO_URL;
  let targetDbName = process.env.DB_NAME || "veeraa";

  if (!mongoUrl) {
    console.log("[Database] MONGO_URL not provided, running with local file storage.");
    return { connected: false, dbName: targetDbName, data: initialData };
  }

  try {
    console.log(`[MongoDB] Connecting to MongoDB Atlas (${targetDbName})...`);
    client = new MongoClient(mongoUrl, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });
    await client.connect();

    // Check existing databases to avoid case-sensitivity conflicts
    // (e.g. Atlas clusters erroring with "db already exists with different case already have: [veeraa] trying to create [Veeraa]")
    try {
      const adminDb = client.db().admin();
      const dbList = await adminDb.listDatabases();
      const matchedDb = dbList.databases.find(
        (d) => d.name.toLowerCase() === targetDbName.toLowerCase()
      );
      if (matchedDb) {
        targetDbName = matchedDb.name;
      }
    } catch {
      // Fallback: prefer lowercase to match standard Atlas conventions
      targetDbName = targetDbName.toLowerCase();
    }

    activeDbName = targetDbName;
    mongoDb = client.db(activeDbName);
    isConnected = true;
    connectionError = null;

    let loadedData: Database;
    try {
      loadedData = await loadDataFromDb(mongoDb, initialData);
    } catch (innerErr: any) {
      // If collection access still triggers case mismatch, parse the existing database name
      const errMsg = innerErr.message || String(innerErr);
      const caseMatch = errMsg.match(/already have:\s*\[([^\]]+)\]/i);
      if (caseMatch) {
        activeDbName = caseMatch[1];
        console.log(`[MongoDB] Retrying with existing database case: "${activeDbName}"`);
        mongoDb = client.db(activeDbName);
        loadedData = await loadDataFromDb(mongoDb, initialData);
      } else {
        throw innerErr;
      }
    }

    console.log(`[MongoDB] Successfully connected to MongoDB database "${activeDbName}"!`);
    return { connected: true, dbName: activeDbName, data: loadedData };
  } catch (err: any) {
    isConnected = false;
    connectionError = err.message || String(err);
    console.error("[MongoDB] Failed to connect to MongoDB Atlas:", connectionError);
    console.log("[MongoDB] Falling back to local file storage.");
    return { connected: false, dbName: activeDbName, data: initialData };
  }
}

export function isMongoConnected(): boolean {
  return isConnected && mongoDb !== null;
}

export async function getMongoStatus() {
  if (!isConnected || !mongoDb) {
    return {
      connected: false,
      database: activeDbName,
      error: connectionError || "Not connected to MongoDB",
    };
  }
  try {
    const productsCount = await mongoDb.collection("products").countDocuments();
    const usersCount = await mongoDb.collection("users").countDocuments();
    const ordersCount = await mongoDb.collection("orders").countDocuments();
    const feedbackCount = await mongoDb.collection("feedback").countDocuments();
    return {
      connected: true,
      database: activeDbName,
      collections: {
        products: productsCount,
        users: usersCount,
        orders: ordersCount,
        feedback: feedbackCount,
      },
    };
  } catch (err: any) {
    return {
      connected: false,
      database: activeDbName,
      error: err.message || String(err),
    };
  }
}

// Atomic persistence helpers for live real-time sync with Atlas
export async function saveUserToMongo(user: User): Promise<void> {
  if (!isConnected || !mongoDb) return;
  try {
    await mongoDb.collection("users").replaceOne({ id: user.id }, user, { upsert: true });
  } catch (err) {
    console.error("[MongoDB] Error saving user:", err);
  }
}

export async function deleteUserFromMongo(userId: string): Promise<void> {
  if (!isConnected || !mongoDb) return;
  try {
    await mongoDb.collection("users").deleteOne({ id: userId });
  } catch (err) {
    console.error("[MongoDB] Error deleting user:", err);
  }
}

export async function saveSessionToMongo(session: Session): Promise<void> {
  if (!isConnected || !mongoDb) return;
  try {
    await mongoDb.collection("sessions").replaceOne({ token: session.token }, session, { upsert: true });
  } catch (err) {
    console.error("[MongoDB] Error saving session:", err);
  }
}

export async function deleteSessionFromMongo(token: string): Promise<void> {
  if (!isConnected || !mongoDb) return;
  try {
    await mongoDb.collection("sessions").deleteOne({ token });
  } catch (err) {
    console.error("[MongoDB] Error deleting session:", err);
  }
}

export async function saveProductToMongo(product: Product): Promise<void> {
  if (!isConnected || !mongoDb) return;
  try {
    await mongoDb.collection("products").replaceOne({ id: product.id }, product, { upsert: true });
  } catch (err) {
    console.error("[MongoDB] Error saving product:", err);
  }
}

export async function deleteProductFromMongo(productId: string): Promise<void> {
  if (!isConnected || !mongoDb) return;
  try {
    await mongoDb.collection("products").deleteOne({ id: productId });
  } catch (err) {
    console.error("[MongoDB] Error deleting product:", err);
  }
}

export async function saveOrderToMongo(order: Order): Promise<void> {
  if (!isConnected || !mongoDb) return;
  try {
    await mongoDb.collection("orders").replaceOne({ id: order.id }, order, { upsert: true });
  } catch (err) {
    console.error("[MongoDB] Error saving order:", err);
  }
}

export async function saveWishlistToMongo(record: WishlistRecord): Promise<void> {
  if (!isConnected || !mongoDb) return;
  try {
    await mongoDb.collection("wishlists").replaceOne(
      { user_id: record.user_id, product_id: record.product_id },
      record,
      { upsert: true }
    );
  } catch (err) {
    console.error("[MongoDB] Error saving wishlist item:", err);
  }
}

export async function deleteWishlistFromMongo(userId: string, productId: string): Promise<void> {
  if (!isConnected || !mongoDb) return;
  try {
    await mongoDb.collection("wishlists").deleteOne({ user_id: userId, product_id: productId });
  } catch (err) {
    console.error("[MongoDB] Error deleting wishlist item:", err);
  }
}

export async function saveFeedbackToMongo(fb: Feedback): Promise<void> {
  if (!isConnected || !mongoDb) return;
  try {
    await mongoDb.collection("feedback").replaceOne({ id: fb.id }, fb, { upsert: true });
  } catch (err) {
    console.error("[MongoDB] Error saving feedback:", err);
  }
}

export async function savePasswordResetToMongo(pr: PasswordReset): Promise<void> {
  if (!isConnected || !mongoDb) return;
  try {
    await mongoDb.collection("password_resets").replaceOne({ token: pr.token }, pr, { upsert: true });
  } catch (err) {
    console.error("[MongoDB] Error saving password reset:", err);
  }
}

export async function deletePasswordResetFromMongo(token: string): Promise<void> {
  if (!isConnected || !mongoDb) return;
  try {
    await mongoDb.collection("password_resets").deleteOne({ token });
  } catch (err) {
    console.error("[MongoDB] Error deleting password reset:", err);
  }
}
