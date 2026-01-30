-- =============================================================================
-- Sample ERP Database Schema for Discovery Agent Testing
-- =============================================================================
-- This simulates a typical enterprise ERP system that the discovery agent
-- would encounter in a real client environment.
-- =============================================================================

-- Create schemas
CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS hr;
CREATE SCHEMA IF NOT EXISTS finance;

-- =============================================================================
-- SALES SCHEMA
-- =============================================================================

CREATE TABLE sales.customers (
    customer_id SERIAL PRIMARY KEY,
    company_name VARCHAR(200) NOT NULL,
    contact_name VARCHAR(100),
    contact_email VARCHAR(100),
    phone VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sales.orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES sales.customers(customer_id),
    order_date DATE NOT NULL,
    ship_date DATE,
    status VARCHAR(50) DEFAULT 'pending',
    total_amount DECIMAL(12, 2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sales.order_items (
    item_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES sales.orders(order_id),
    product_id INTEGER,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(5, 2) DEFAULT 0
);

-- =============================================================================
-- INVENTORY SCHEMA
-- =============================================================================

CREATE TABLE inventory.products (
    product_id SERIAL PRIMARY KEY,
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    unit_price DECIMAL(10, 2),
    quantity_in_stock INTEGER DEFAULT 0,
    reorder_level INTEGER DEFAULT 10,
    discontinued BOOLEAN DEFAULT FALSE
);

CREATE TABLE inventory.warehouses (
    warehouse_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(200),
    capacity INTEGER
);

CREATE TABLE inventory.stock_movements (
    movement_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES inventory.products(product_id),
    warehouse_id INTEGER REFERENCES inventory.warehouses(warehouse_id),
    movement_type VARCHAR(20), -- 'in', 'out', 'transfer'
    quantity INTEGER NOT NULL,
    reference_id INTEGER,
    movement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- HR SCHEMA
-- =============================================================================

CREATE TABLE hr.departments (
    department_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    manager_id INTEGER,
    budget DECIMAL(15, 2)
);

CREATE TABLE hr.employees (
    employee_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE,
    phone VARCHAR(50),
    hire_date DATE,
    department_id INTEGER REFERENCES hr.departments(department_id),
    job_title VARCHAR(100),
    salary DECIMAL(10, 2),
    manager_id INTEGER REFERENCES hr.employees(employee_id)
);

-- =============================================================================
-- FINANCE SCHEMA
-- =============================================================================

CREATE TABLE finance.accounts (
    account_id SERIAL PRIMARY KEY,
    account_number VARCHAR(20) UNIQUE NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    account_type VARCHAR(50), -- 'asset', 'liability', 'equity', 'revenue', 'expense'
    parent_account_id INTEGER REFERENCES finance.accounts(account_id),
    balance DECIMAL(15, 2) DEFAULT 0
);

CREATE TABLE finance.transactions (
    transaction_id SERIAL PRIMARY KEY,
    transaction_date DATE NOT NULL,
    description TEXT,
    reference_number VARCHAR(50),
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE finance.transaction_lines (
    line_id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES finance.transactions(transaction_id),
    account_id INTEGER REFERENCES finance.accounts(account_id),
    debit_amount DECIMAL(15, 2) DEFAULT 0,
    credit_amount DECIMAL(15, 2) DEFAULT 0
);

-- =============================================================================
-- SAMPLE DATA
-- =============================================================================

INSERT INTO sales.customers (company_name, contact_name, contact_email, city, country) VALUES
('Acme Corporation', 'John Smith', 'john@acme.com', 'New York', 'USA'),
('TechStart Inc', 'Jane Doe', 'jane@techstart.com', 'San Francisco', 'USA'),
('Global Industries', 'Bob Wilson', 'bob@global.com', 'London', 'UK');

INSERT INTO inventory.products (sku, name, category, unit_price, quantity_in_stock) VALUES
('PROD-001', 'Widget A', 'Widgets', 29.99, 100),
('PROD-002', 'Widget B', 'Widgets', 49.99, 50),
('PROD-003', 'Gadget X', 'Gadgets', 199.99, 25);

INSERT INTO hr.departments (name, budget) VALUES
('Engineering', 1000000),
('Sales', 500000),
('Finance', 300000);

INSERT INTO finance.accounts (account_number, account_name, account_type) VALUES
('1000', 'Cash', 'asset'),
('2000', 'Accounts Payable', 'liability'),
('3000', 'Retained Earnings', 'equity'),
('4000', 'Sales Revenue', 'revenue'),
('5000', 'Operating Expenses', 'expense');

-- =============================================================================
-- VIEWS (for complexity)
-- =============================================================================

CREATE VIEW sales.customer_order_summary AS
SELECT
    c.customer_id,
    c.company_name,
    COUNT(o.order_id) as total_orders,
    SUM(o.total_amount) as total_revenue
FROM sales.customers c
LEFT JOIN sales.orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.company_name;

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_orders_customer ON sales.orders(customer_id);
CREATE INDEX idx_orders_date ON sales.orders(order_date);
CREATE INDEX idx_products_category ON inventory.products(category);
CREATE INDEX idx_employees_department ON hr.employees(department_id);
