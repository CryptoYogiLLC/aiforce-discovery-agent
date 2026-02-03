-- PostgreSQL initialization script for dry-run testing
-- This creates realistic schemas for the code analyzer to discover

-- =============================================================================
-- CUSTOMERS SCHEMA (CRM-style data)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS crm;

CREATE TABLE crm.customers (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    postal_code VARCHAR(20),
    country VARCHAR(50) DEFAULT 'USA',
    customer_type VARCHAR(20) DEFAULT 'individual',
    credit_limit DECIMAL(10,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_customers_email ON crm.customers(email);
CREATE INDEX idx_customers_phone ON crm.customers(phone);
CREATE INDEX idx_customers_city ON crm.customers(city);

COMMENT ON TABLE crm.customers IS 'Customer master data for CRM system';

-- =============================================================================
-- ORDERS SCHEMA (E-commerce data)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS ecommerce;

CREATE TABLE ecommerce.products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    price DECIMAL(10,2) NOT NULL,
    cost DECIMAL(10,2),
    inventory_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ecommerce.orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES crm.customers(id),
    order_date TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'pending',
    subtotal DECIMAL(10,2),
    tax_amount DECIMAL(10,2),
    shipping_amount DECIMAL(10,2),
    total DECIMAL(10,2),
    shipping_address TEXT,
    billing_address TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ecommerce.order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES ecommerce.orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES ecommerce.products(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_orders_customer ON ecommerce.orders(customer_id);
CREATE INDEX idx_orders_status ON ecommerce.orders(status);
CREATE INDEX idx_orders_date ON ecommerce.orders(order_date);
CREATE INDEX idx_order_items_order ON ecommerce.order_items(order_id);

-- =============================================================================
-- INVENTORY SCHEMA (Warehouse data)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS inventory;

CREATE TABLE inventory.warehouses (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    capacity INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE inventory.stock_levels (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER REFERENCES inventory.warehouses(id),
    product_id INTEGER REFERENCES ecommerce.products(id),
    quantity INTEGER DEFAULT 0,
    min_level INTEGER DEFAULT 10,
    max_level INTEGER DEFAULT 1000,
    last_counted_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(warehouse_id, product_id)
);

CREATE TABLE inventory.stock_movements (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER REFERENCES inventory.warehouses(id),
    product_id INTEGER REFERENCES ecommerce.products(id),
    movement_type VARCHAR(20) NOT NULL,
    quantity INTEGER NOT NULL,
    reference_type VARCHAR(20),
    reference_id INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_stock_levels_warehouse ON inventory.stock_levels(warehouse_id);
CREATE INDEX idx_stock_movements_product ON inventory.stock_movements(product_id);
CREATE INDEX idx_stock_movements_date ON inventory.stock_movements(created_at);

-- =============================================================================
-- SAMPLE DATA
-- =============================================================================

-- Insert sample customers
INSERT INTO crm.customers (email, first_name, last_name, phone, city, state, customer_type)
VALUES
    ('john.doe@example.com', 'John', 'Doe', '555-0101', 'New York', 'NY', 'individual'),
    ('jane.smith@example.com', 'Jane', 'Smith', '555-0102', 'Los Angeles', 'CA', 'individual'),
    ('acme@corp.com', 'ACME', 'Corporation', '555-0103', 'Chicago', 'IL', 'business'),
    ('tech.startup@example.com', 'Tech', 'Startup', '555-0104', 'San Francisco', 'CA', 'business');

-- Insert sample products
INSERT INTO ecommerce.products (sku, name, category, price, cost, inventory_count)
VALUES
    ('LAPTOP-001', 'Professional Laptop 15"', 'Electronics', 1299.99, 899.00, 50),
    ('PHONE-001', 'Smartphone Pro Max', 'Electronics', 999.99, 650.00, 100),
    ('HEADSET-001', 'Wireless Headphones', 'Electronics', 249.99, 120.00, 200),
    ('DESK-001', 'Standing Desk', 'Furniture', 599.99, 350.00, 25),
    ('CHAIR-001', 'Ergonomic Office Chair', 'Furniture', 449.99, 280.00, 40);

-- Insert sample warehouses
INSERT INTO inventory.warehouses (code, name, city, state, capacity)
VALUES
    ('WH-EAST', 'East Coast Warehouse', 'Newark', 'NJ', 10000),
    ('WH-WEST', 'West Coast Warehouse', 'Los Angeles', 'CA', 15000),
    ('WH-CENT', 'Central Distribution', 'Chicago', 'IL', 20000);

-- Insert sample stock levels
INSERT INTO inventory.stock_levels (warehouse_id, product_id, quantity, min_level, max_level)
SELECT w.id, p.id,
    FLOOR(RANDOM() * 100 + 10)::INTEGER,
    10,
    500
FROM inventory.warehouses w
CROSS JOIN ecommerce.products p;

-- Insert sample order
INSERT INTO ecommerce.orders (order_number, customer_id, status, subtotal, tax_amount, shipping_amount, total)
VALUES ('ORD-2026-0001', 1, 'completed', 1549.98, 124.00, 0.00, 1673.98);

INSERT INTO ecommerce.order_items (order_id, product_id, quantity, unit_price, total_price)
VALUES (1, 1, 1, 1299.99, 1299.99), (1, 3, 1, 249.99, 249.99);

-- =============================================================================
-- VIEWS (for discovery)
-- =============================================================================

CREATE VIEW ecommerce.order_summary AS
SELECT
    o.id,
    o.order_number,
    c.email as customer_email,
    c.first_name || ' ' || c.last_name as customer_name,
    o.order_date,
    o.status,
    o.total,
    COUNT(oi.id) as item_count
FROM ecommerce.orders o
JOIN crm.customers c ON o.customer_id = c.id
LEFT JOIN ecommerce.order_items oi ON o.id = oi.order_id
GROUP BY o.id, o.order_number, c.email, c.first_name, c.last_name, o.order_date, o.status, o.total;

CREATE VIEW inventory.low_stock_alert AS
SELECT
    p.sku,
    p.name as product_name,
    w.code as warehouse_code,
    sl.quantity,
    sl.min_level
FROM inventory.stock_levels sl
JOIN ecommerce.products p ON sl.product_id = p.id
JOIN inventory.warehouses w ON sl.warehouse_id = w.id
WHERE sl.quantity < sl.min_level;

-- Grant permissions
GRANT USAGE ON SCHEMA crm TO PUBLIC;
GRANT USAGE ON SCHEMA ecommerce TO PUBLIC;
GRANT USAGE ON SCHEMA inventory TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA crm TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA ecommerce TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA inventory TO PUBLIC;
