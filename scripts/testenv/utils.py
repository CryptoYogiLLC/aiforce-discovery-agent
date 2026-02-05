"""
Utility functions for test environment generation.

Random value generators and helper functions used across the package.
"""

import random
import string

from testenv.pools import DEPARTMENT_NAMES


def random_string(length=8):
    """Generate random alphanumeric string."""
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


def random_ip(subnet_prefix="172.28.0", used_ips=set()):
    """Generate random IP in subnet, avoiding collisions."""
    while True:
        last_octet = random.randint(10, 250)
        ip = f"{subnet_prefix}.{last_octet}"
        if ip not in used_ips:
            used_ips.add(ip)
            return ip


def generate_service_name(base_name, index):
    """Generate unique service name."""
    dept = random.choice(DEPARTMENT_NAMES)
    return f"target-{dept}-{base_name}-{index:02d}"


def generate_password():
    """Generate random password."""
    return "".join(random.choices(string.ascii_letters + string.digits, k=16))


def generate_database_env(db_type, db_name):
    """Generate environment variables for database."""
    password = generate_password()
    user = f"{random.choice(DEPARTMENT_NAMES)}_user"

    if "postgres" in db_type:
        return {
            "POSTGRES_USER": user,
            "POSTGRES_PASSWORD": password,
            "POSTGRES_DB": f"{db_name}_db",
        }
    elif "mysql" in db_type or "mariadb" in db_type:
        return {
            "MYSQL_ROOT_PASSWORD": generate_password(),
            "MYSQL_DATABASE": f"{db_name}_db",
            "MYSQL_USER": user,
            "MYSQL_PASSWORD": password,
        }
    elif "mongo" in db_type:
        return {
            "MONGO_INITDB_ROOT_USERNAME": user,
            "MONGO_INITDB_ROOT_PASSWORD": password,
        }
    elif "elasticsearch" in db_type:
        return {
            "discovery.type": "single-node",
            "xpack.security.enabled": "false",
            "ES_JAVA_OPTS": "-Xms256m -Xmx256m",
        }
    elif "couchdb" in db_type:
        return {"COUCHDB_USER": user, "COUCHDB_PASSWORD": password}
    return {}
