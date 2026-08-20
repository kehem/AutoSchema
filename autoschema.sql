-- ===============================================================
-- AutoSchema v2 - Generated DDL for database: postgresql (schema: public)
-- ===============================================================

CREATE SCHEMA IF NOT EXISTS public;

-- Roles
DO $do$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN;
    END IF;
END $do$;
DO $do$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reporting') THEN
        CREATE ROLE reporting;
    END IF;
END $do$;

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public CASCADE;
CREATE EXTENSION IF NOT EXISTS citext CASCADE;
CREATE EXTENSION IF NOT EXISTS btree_gist CASCADE;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" CASCADE;

-- Sequences
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1000 INCREMENT 5 MINVALUE 1 MAXVALUE 999999 CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.audit_seq START 1 INCREMENT 1;

-- Custom ENUM types
CREATE TYPE public.status AS ENUM ('active', 'inactive', 'pending', 'archived');
CREATE TYPE public.priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.user_role AS ENUM ('admin', 'editor', 'viewer', 'api');

-- Custom Domains
CREATE DOMAIN public.positive_int AS INTEGER CHECK (VALUE > 0);
COMMENT ON DOMAIN public.positive_int IS 'Positive integer domain';
CREATE DOMAIN public.us_zip_code AS TEXT CHECK (VALUE ~ '^[0-9]{5}(-[0-9]{4})?$');
CREATE DOMAIN public.email_address AS VARCHAR(320) CHECK (VALUE ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Functions (created before tables)
CREATE FUNCTION public.set_updated_at ()
    RETURNS trigger
    LANGUAGE plpgsql
    VOLATILE
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
    $$;


-- Tables

CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY  /* Primary key */
,
    username CITEXT NOT NULL UNIQUE  /* Unique username (case-insensitive) */
,
    email email_address NOT NULL
,
    password_hash BYTEA NOT NULL
,
    role user_role DEFAULT 'viewer'
,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
,
    last_login TIMESTAMP WITH TIME ZONE
,
    session_timeout INTERVAL DEFAULT '2 hours'
,
    ip_address INET
,
    mac MACADDR
,
    profile JSONB DEFAULT '{}'::jsonb
,
    prefs TEXT[] DEFAULT '{}'
,
    deleted_at TIMESTAMP WITH TIME ZONE
,
    active_range DATERANGE
,
    username_search TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', username)) STORED
,
    CONSTRAINT uq_users_username_email UNIQUE (username, email),
    CONSTRAINT chk_email_not_empty CHECK (email <> ''),
    CONSTRAINT excl_users_daterange EXCLUDE USING GIST (active_range WITH &&) WHERE (active_range IS NOT NULL)
);
ALTER TABLE public.users SET (fillfactor=70);
ALTER TABLE public.users SET TABLESPACE pg_default;
CREATE INDEX idx_users_created ON public.users USING BTREE (created_at DESC);
CREATE INDEX idx_users_profile ON public.users USING GIN (profile);
CREATE UNIQUE INDEX idx_users_lower_email ON public.users USING BTREE (LOWER(email)) WHERE (deleted_at IS NULL);
CREATE INDEX idx_users_prefs ON public.users USING GIN (prefs);
COMMENT ON TABLE public.users IS 'Application user accounts';
COMMENT ON COLUMN public.users.username IS 'Login name';
COMMENT ON COLUMN public.users.email IS 'Contact e-mail address';

CREATE TABLE IF NOT EXISTS public.categories (
    id BIGSERIAL PRIMARY KEY
,
    name VARCHAR(100) NOT NULL UNIQUE
,
    parent_id BIGINT REFERENCES public.categories(id) ON DELETE CASCADE
,
    slug VARCHAR(120)
,
    position SMALLINT DEFAULT 0 CHECK (position >= 0)
,
    CONSTRAINT chk_slug_not_empty CHECK (slug IS NULL OR slug <> '')
);
COMMENT ON TABLE public.categories IS 'Content categories (self-referencing tree)';

CREATE TABLE IF NOT EXISTS public.products (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY
,
    name VARCHAR(200) NOT NULL
,
    description TEXT
,
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0)
,
    cost MONEY
,
    discount DOUBLE PRECISION DEFAULT 0.0
,
    rating REAL
,
    sku VARCHAR(50) NOT NULL UNIQUE
,
    stock positive_int DEFAULT 1
,
    is_active BOOLEAN DEFAULT true
,
    flags BIT(8) DEFAULT B'00000000'
,
    category_id INTEGER REFERENCES public.categories(id) ON DELETE RESTRICT ON UPDATE CASCADE
,
    meta JSON DEFAULT '{}'
,
    tags VARCHAR(50)[] DEFAULT '{}'
,
    geoloc POINT
,
    bounding_box BOX
,
    region POLYGON
,
    valid_during TSTZRANGE
,
    min_quantity SMALLINT
,
    max_quantity SMALLINT
,
    quantity_range INT4RANGE GENERATED ALWAYS AS (int4range(min_quantity, max_quantity)) STORED
,
    data BYTEA
,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
,
    updated_at TIMESTAMP
,
    price_with_tax NUMERIC(10,2) GENERATED ALWAYS AS (price * 1.15) STORED
,
    FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_qty_range CHECK (min_quantity <= max_quantity),
    CONSTRAINT excl_products_qty EXCLUDE USING GIST (id WITH =, quantity_range WITH &&)
);
CREATE INDEX idx_products_name ON public.products (name);
CREATE INDEX idx_products_price ON public.products USING BRIN (price);
CREATE INDEX idx_products_tags_gin ON public.products USING GIN (tags);
CREATE INDEX idx_products_cover ON public.products (id) INCLUDE (name, price);
CREATE UNIQUE INDEX idx_products_partial ON public.products (sku) WHERE (is_active);
CREATE TRIGGER trg_products_set_updated
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
COMMENT ON TRIGGER trg_products_set_updated ON public.products IS 'Sets updated_at on update';

COMMENT ON TABLE public.products IS 'Product catalog entries';

CREATE TABLE IF NOT EXISTS public.orders (
    id BIGSERIAL
,
    order_number VARCHAR(30) DEFAULT nextval('order_number_seq')::text NOT NULL
,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
,
    status status DEFAULT 'pending'
,
    priority priority
,
    total NUMERIC(12,2) DEFAULT 0
,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
,
    shipped_date DATE
,
    delivery_window TSRANGE
,
    notes TEXT
,
    zip us_zip_code
,
    PRIMARY KEY (id),
    CONSTRAINT uq_orders_number UNIQUE (order_number),
    CONSTRAINT chk_total_positive CHECK (total >= 0)
);
CREATE INDEX idx_orders_user ON public.orders USING HASH (user_id);
CREATE INDEX idx_orders_status_created ON public.orders (status, created_at DESC) WHERE (status = 'pending');
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY pol_orders_owner
    ON public.orders
    FOR SELECT
    TO app_user
    USING (user_id = current_setting('app.user_id')::uuid)
;

CREATE POLICY pol_orders_insert
    ON public.orders
    FOR INSERT
    TO app_user
    WITH CHECK (user_id = current_setting('app.user_id')::uuid)
;

COMMENT ON TABLE public.orders IS 'Customer orders with row-level security';

CREATE TABLE IF NOT EXISTS public.order_items (
    id BIGSERIAL
,
    order_id BIGINT
,
    product_id INTEGER
,
    qty SMALLINT DEFAULT 1 CHECK (qty > 0)
,
    unit_price NUMERIC(10,2) NOT NULL
,
    line_total NUMERIC(12,2) GENERATED ALWAYS AS (qty * unit_price) STORED
,
    PRIMARY KEY (id),
    CONSTRAINT uq_order_items UNIQUE (order_id, product_id),
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT
);
CREATE INDEX idx_order_items_order ON public.order_items (order_id);
CREATE INDEX idx_order_items_product ON public.order_items (product_id);
COMMENT ON TABLE public.order_items IS 'Line items inside an order';

CREATE TABLE IF NOT EXISTS public.audit_log (
    id BIGSERIAL
,
    entity_type VARCHAR(100) NOT NULL
,
    entity_id VARCHAR(100)
,
    action VARCHAR(20) NOT NULL
,
    actor UUID
,
    changes JSONB
,
    request_id UUID DEFAULT gen_random_uuid()
,
    event_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
,
    PRIMARY KEY (id),
    CONSTRAINT chk_action CHECK (action IN ('INSERT','UPDATE','DELETE','SELECT'))
);
CREATE INDEX idx_audit_entity ON public.audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_time ON public.audit_log USING BRIN (event_time);
CREATE INDEX idx_audit_changes ON public.audit_log USING GIN (changes);
COMMENT ON TABLE public.audit_log IS 'Append-only audit trail';

CREATE TABLE IF NOT EXISTS public.user_backup (
    LIKE public.users INCLUDING DEFAULTS INCLUDING STORAGE,
    backup_id BIGSERIAL
,
    taken_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);
COMMENT ON TABLE public.user_backup IS 'Demonstrates CREATE TABLE ... LIKE users INCLUDING DEFAULTS';

CREATE TABLE IF NOT EXISTS public.people (
    id BIGSERIAL
,
    full_name VARCHAR(200) NOT NULL
,
    born_on DATE
,
    PRIMARY KEY (id)
);
COMMENT ON TABLE public.people IS 'Parent table for inheritance demo';

CREATE TABLE IF NOT EXISTS public.employees (
    hire_date DATE
,
    salary NUMERIC(12,2)

) INHERITS (public.people);
ALTER TABLE public.employees ADD PRIMARY KEY (id);
CREATE INDEX idx_employees_salary ON public.employees (salary);
COMMENT ON TABLE public.employees IS 'Child table that inherits people';

CREATE UNLOGGED TABLE IF NOT EXISTS public.session_stats (
    id BIGSERIAL
,
    user_id UUID
,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
,
    duration INTERVAL
,
    PRIMARY KEY (id)
);
COMMENT ON TABLE public.session_stats IS 'Demonstrates UNLOGGED table';

-- Views
CREATE VIEW public.v_users_active AS
SELECT id, username, email, role FROM users WHERE role <> 'admin'
 WITH CASCADED CHECK OPTION;

CREATE VIEW public.v_order_totals AS
SELECT o.id, o.order_number, SUM(oi.line_total) AS total FROM orders o JOIN order_items oi ON oi.order_id = o.id GROUP BY o.id, o.order_number
;

-- Materialized Views
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_product_sales WITH (fillfactor=100) TABLESPACE pg_default AS
SELECT p.id, p.name, SUM(oi.qty) AS units_sold FROM products p JOIN order_items oi ON oi.product_id = p.id GROUP BY p.id, p.name
;
CREATE INDEX idx_mv_product_sales_name ON public.mv_product_sales (name);
CREATE INDEX idx_mv_product_sales_units ON public.mv_product_sales (units_sold DESC);

-- Functions (created after tables)
CREATE FUNCTION public.get_user_count ()
    RETURNS BIGINT
    LANGUAGE sql
    STABLE
    AS $$
SELECT COUNT(*) FROM users;
    $$;


-- ===============================================================
-- End of AutoSchema v2 output
-- ===============================================================
