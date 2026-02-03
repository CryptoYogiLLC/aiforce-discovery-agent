// MongoDB initialization script for dry-run testing
// This creates realistic collections and documents for the code analyzer to discover

// Switch to analytics database
db = db.getSiblingDB("analytics");

// =============================================================================
// USERS COLLECTION
// =============================================================================

db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["email", "username", "created_at"],
      properties: {
        email: {
          bsonType: "string",
          pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
          description: "must be a valid email address",
        },
        username: {
          bsonType: "string",
          minLength: 3,
          maxLength: 50,
        },
        profile: {
          bsonType: "object",
          properties: {
            first_name: { bsonType: "string" },
            last_name: { bsonType: "string" },
            avatar_url: { bsonType: "string" },
            bio: { bsonType: "string" },
          },
        },
        preferences: {
          bsonType: "object",
        },
        role: {
          enum: ["user", "admin", "moderator"],
        },
        is_active: { bsonType: "bool" },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" },
      },
    },
  },
});

db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ "profile.last_name": 1 });
db.users.createIndex({ created_at: -1 });

// Insert sample users
db.users.insertMany([
  {
    email: "john.analytics@example.com",
    username: "john_analyst",
    profile: {
      first_name: "John",
      last_name: "Analyst",
      bio: "Data analyst specializing in user behavior",
    },
    preferences: {
      theme: "dark",
      notifications: true,
      timezone: "America/New_York",
    },
    role: "admin",
    is_active: true,
    created_at: new Date("2024-01-15"),
    updated_at: new Date(),
  },
  {
    email: "jane.data@example.com",
    username: "jane_data",
    profile: {
      first_name: "Jane",
      last_name: "Data",
      bio: "Business intelligence lead",
    },
    preferences: {
      theme: "light",
      notifications: true,
      timezone: "America/Los_Angeles",
    },
    role: "user",
    is_active: true,
    created_at: new Date("2024-03-20"),
    updated_at: new Date(),
  },
]);

// =============================================================================
// EVENTS COLLECTION (Time-series style)
// =============================================================================

db.createCollection("events", {
  timeseries: {
    timeField: "timestamp",
    metaField: "metadata",
    granularity: "seconds",
  },
});

db.events.createIndex({ "metadata.user_id": 1 });
db.events.createIndex({ "metadata.event_type": 1 });
db.events.createIndex({ timestamp: -1 });

// Insert sample events
const eventTypes = [
  "page_view",
  "click",
  "purchase",
  "signup",
  "login",
  "search",
];
const pages = ["/home", "/products", "/checkout", "/account", "/search"];

for (let i = 0; i < 100; i++) {
  db.events.insertOne({
    timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    metadata: {
      user_id: `user_${Math.floor(Math.random() * 10) + 1}`,
      event_type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
      session_id: `sess_${Math.random().toString(36).substr(2, 9)}`,
    },
    data: {
      page: pages[Math.floor(Math.random() * pages.length)],
      duration_ms: Math.floor(Math.random() * 30000),
      referrer: Math.random() > 0.5 ? "google.com" : "direct",
    },
  });
}

// =============================================================================
// PRODUCTS COLLECTION
// =============================================================================

db.createCollection("products");

db.products.createIndex({ sku: 1 }, { unique: true });
db.products.createIndex({ category: 1 });
db.products.createIndex({ "pricing.current_price": 1 });
db.products.createIndex({ name: "text", description: "text" });

db.products.insertMany([
  {
    sku: "WIDGET-001",
    name: "Premium Widget",
    description: "High-quality widget for professional use",
    category: "widgets",
    tags: ["premium", "professional", "bestseller"],
    pricing: {
      current_price: 49.99,
      original_price: 69.99,
      currency: "USD",
      discount_percent: 28,
    },
    inventory: {
      total_stock: 500,
      reserved: 25,
      available: 475,
    },
    metrics: {
      views: 15234,
      purchases: 892,
      rating: 4.7,
      review_count: 234,
    },
    created_at: new Date("2024-06-01"),
    updated_at: new Date(),
  },
  {
    sku: "GADGET-001",
    name: "Smart Gadget Pro",
    description: "Next-generation smart gadget with AI features",
    category: "gadgets",
    tags: ["smart", "ai", "new"],
    pricing: {
      current_price: 199.99,
      original_price: 199.99,
      currency: "USD",
      discount_percent: 0,
    },
    inventory: {
      total_stock: 200,
      reserved: 50,
      available: 150,
    },
    metrics: {
      views: 8543,
      purchases: 312,
      rating: 4.9,
      review_count: 89,
    },
    created_at: new Date("2025-01-10"),
    updated_at: new Date(),
  },
]);

// =============================================================================
// SESSIONS COLLECTION
// =============================================================================

db.createCollection("sessions");

db.sessions.createIndex({ session_id: 1 }, { unique: true });
db.sessions.createIndex({ user_id: 1 });
db.sessions.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });

// =============================================================================
// AGGREGATION VIEWS
// =============================================================================

db.createView("daily_event_summary", "events", [
  {
    $group: {
      _id: {
        date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
        event_type: "$metadata.event_type",
      },
      count: { $sum: 1 },
      unique_users: { $addToSet: "$metadata.user_id" },
    },
  },
  {
    $project: {
      date: "$_id.date",
      event_type: "$_id.event_type",
      count: 1,
      unique_user_count: { $size: "$unique_users" },
    },
  },
  { $sort: { date: -1 } },
]);

db.createView("product_performance", "products", [
  {
    $project: {
      sku: 1,
      name: 1,
      category: 1,
      current_price: "$pricing.current_price",
      available_stock: "$inventory.available",
      conversion_rate: {
        $round: [
          {
            $multiply: [
              { $divide: ["$metrics.purchases", "$metrics.views"] },
              100,
            ],
          },
          2,
        ],
      },
      rating: "$metrics.rating",
    },
  },
  { $sort: { conversion_rate: -1 } },
]);

// =============================================================================
// LOGGING COLLECTION (for audit trail)
// =============================================================================

db.createCollection("audit_logs", {
  capped: true,
  size: 104857600, // 100MB
  max: 100000,
});

db.audit_logs.createIndex({ timestamp: -1 });
db.audit_logs.createIndex({ action: 1, resource: 1 });
db.audit_logs.createIndex({ user_id: 1 });

print("MongoDB initialization complete!");
print("Collections created: users, events, products, sessions, audit_logs");
print("Views created: daily_event_summary, product_performance");
