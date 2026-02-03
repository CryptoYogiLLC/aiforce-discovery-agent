-- MySQL initialization script for dry-run testing
-- This creates realistic schemas for the code analyzer to discover

-- =============================================================================
-- LEGACY CRM DATABASE (simulates older system)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS legacy_crm;
USE legacy_crm;

-- Customer table (legacy naming conventions)
CREATE TABLE tbl_customer (
    customer_id INT AUTO_INCREMENT PRIMARY KEY,
    cust_email VARCHAR(255) NOT NULL UNIQUE,
    cust_fname VARCHAR(100),
    cust_lname VARCHAR(100),
    cust_phone VARCHAR(20),
    cust_addr1 TEXT,
    cust_addr2 TEXT,
    cust_city VARCHAR(100),
    cust_state VARCHAR(50),
    cust_zip VARCHAR(20),
    cust_country VARCHAR(50) DEFAULT 'USA',
    cust_type ENUM('individual', 'business', 'partner') DEFAULT 'individual',
    credit_lmt DECIMAL(10,2) DEFAULT 0.00,
    is_active TINYINT(1) DEFAULT 1,
    created_dt DATETIME DEFAULT CURRENT_TIMESTAMP,
    modified_dt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (cust_email),
    INDEX idx_phone (cust_phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Contact log (legacy style)
CREATE TABLE tbl_contact_log (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    contact_type ENUM('phone', 'email', 'chat', 'meeting') NOT NULL,
    contact_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    contact_by VARCHAR(100),
    subject VARCHAR(255),
    notes TEXT,
    follow_up_date DATE,
    is_resolved TINYINT(1) DEFAULT 0,
    FOREIGN KEY (customer_id) REFERENCES tbl_customer(customer_id),
    INDEX idx_customer (customer_id),
    INDEX idx_date (contact_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sales opportunities
CREATE TABLE tbl_opportunity (
    opp_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    opp_name VARCHAR(200) NOT NULL,
    opp_value DECIMAL(12,2),
    opp_stage ENUM('prospect', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost') DEFAULT 'prospect',
    probability INT DEFAULT 0,
    expected_close DATE,
    assigned_to VARCHAR(100),
    notes TEXT,
    created_dt DATETIME DEFAULT CURRENT_TIMESTAMP,
    modified_dt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES tbl_customer(customer_id),
    INDEX idx_customer (customer_id),
    INDEX idx_stage (opp_stage),
    INDEX idx_close_date (expected_close)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- HR DATABASE
-- =============================================================================

CREATE DATABASE IF NOT EXISTS hr_system;
USE hr_system;

-- Departments
CREATE TABLE departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    manager_id INT,
    parent_dept_id INT,
    cost_center VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_dept_id) REFERENCES departments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Employees
CREATE TABLE employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_number VARCHAR(20) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    department_id INT,
    job_title VARCHAR(100),
    manager_id INT,
    hire_date DATE NOT NULL,
    termination_date DATE,
    salary DECIMAL(10,2),
    employment_type ENUM('full_time', 'part_time', 'contractor', 'intern') DEFAULT 'full_time',
    status ENUM('active', 'on_leave', 'terminated') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (manager_id) REFERENCES employees(id),
    INDEX idx_dept (department_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Time off requests
CREATE TABLE time_off_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    request_type ENUM('vacation', 'sick', 'personal', 'bereavement', 'jury_duty') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    hours_requested DECIMAL(5,2),
    status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending',
    approved_by INT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (approved_by) REFERENCES employees(id),
    INDEX idx_employee (employee_id),
    INDEX idx_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SAMPLE DATA
-- =============================================================================

USE legacy_crm;

INSERT INTO tbl_customer (cust_email, cust_fname, cust_lname, cust_phone, cust_city, cust_state, cust_type)
VALUES
    ('john.legacy@example.com', 'John', 'Legacy', '555-1001', 'Boston', 'MA', 'individual'),
    ('acme.legacy@corp.com', 'ACME', 'Legacy Corp', '555-1002', 'Dallas', 'TX', 'business'),
    ('partner.one@example.com', 'Partner', 'One', '555-1003', 'Seattle', 'WA', 'partner');

INSERT INTO tbl_opportunity (customer_id, opp_name, opp_value, opp_stage, probability, expected_close)
VALUES
    (1, 'Enterprise License Renewal', 50000.00, 'negotiation', 75, '2026-03-15'),
    (2, 'New Implementation Project', 150000.00, 'proposal', 50, '2026-06-01'),
    (3, 'Partnership Expansion', 200000.00, 'qualified', 30, '2026-09-01');

USE hr_system;

INSERT INTO departments (code, name, cost_center)
VALUES
    ('ENG', 'Engineering', 'CC-100'),
    ('SALES', 'Sales', 'CC-200'),
    ('HR', 'Human Resources', 'CC-300'),
    ('FIN', 'Finance', 'CC-400');

INSERT INTO employees (employee_number, first_name, last_name, email, department_id, job_title, hire_date, salary, employment_type)
VALUES
    ('EMP-001', 'Alice', 'Engineer', 'alice@company.com', 1, 'Senior Developer', '2022-01-15', 120000.00, 'full_time'),
    ('EMP-002', 'Bob', 'Manager', 'bob@company.com', 1, 'Engineering Manager', '2020-06-01', 150000.00, 'full_time'),
    ('EMP-003', 'Carol', 'Sales', 'carol@company.com', 2, 'Sales Representative', '2023-03-01', 80000.00, 'full_time'),
    ('EMP-004', 'Dave', 'Intern', 'dave@company.com', 1, 'Software Intern', '2025-06-01', 50000.00, 'intern');

-- Update manager references
UPDATE employees SET manager_id = 2 WHERE id IN (1, 4);

-- =============================================================================
-- STORED PROCEDURES
-- =============================================================================

USE legacy_crm;

DELIMITER //

CREATE PROCEDURE sp_get_customer_summary(IN p_customer_id INT)
BEGIN
    SELECT
        c.customer_id,
        c.cust_email,
        CONCAT(c.cust_fname, ' ', c.cust_lname) AS customer_name,
        c.cust_type,
        COUNT(DISTINCT cl.log_id) AS contact_count,
        COUNT(DISTINCT o.opp_id) AS opportunity_count,
        SUM(CASE WHEN o.opp_stage = 'closed_won' THEN o.opp_value ELSE 0 END) AS total_won_value
    FROM tbl_customer c
    LEFT JOIN tbl_contact_log cl ON c.customer_id = cl.customer_id
    LEFT JOIN tbl_opportunity o ON c.customer_id = o.customer_id
    WHERE c.customer_id = p_customer_id
    GROUP BY c.customer_id, c.cust_email, c.cust_fname, c.cust_lname, c.cust_type;
END //

DELIMITER ;

-- =============================================================================
-- VIEWS
-- =============================================================================

USE hr_system;

CREATE VIEW employee_directory AS
SELECT
    e.employee_number,
    CONCAT(e.first_name, ' ', e.last_name) AS full_name,
    e.email,
    e.phone,
    e.job_title,
    d.name AS department,
    CONCAT(m.first_name, ' ', m.last_name) AS manager_name,
    e.hire_date,
    e.status
FROM employees e
LEFT JOIN departments d ON e.department_id = d.id
LEFT JOIN employees m ON e.manager_id = m.id
WHERE e.status = 'active';

CREATE VIEW pending_time_off AS
SELECT
    CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
    e.email,
    d.name AS department,
    t.request_type,
    t.start_date,
    t.end_date,
    t.hours_requested,
    t.created_at AS requested_at
FROM time_off_requests t
JOIN employees e ON t.employee_id = e.id
LEFT JOIN departments d ON e.department_id = d.id
WHERE t.status = 'pending'
ORDER BY t.created_at;
