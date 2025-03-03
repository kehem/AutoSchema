-- AutoSchema for database: postgresql

CREATE SCHEMA IF NOT EXISTS public;

CREATE TYPE public.status AS ENUM ('active', 'inactive', 'pending');

CREATE TYPE public.priority AS ENUM ('low', 'medium', 'high');

CREATE TABLE public.website_info (
    id SERIAL,
    hide BOOLEAN DEFAULT FALSE,
    delete BOOLEAN DEFAULT FALSE,
    Name VARCHAR(50) NOT NULL,
    Email VARCHAR(50) UNIQUE,
    Status public.status DEFAULT 'active',
    Priority public.priority,
    CreatedAt TIMESTAMP,
    Tags TEXT[],
    Metadata JSONB,
    LogoFile TEXT,
    LogoFile_mime_type VARCHAR(50),
    CHECK (LogoFile_mime_type IS NULL OR (mime_type ~ '^(application|audio|image|text|video)/[a-z0-9]+$'))  -- File path (e.g., '/path/to/file'),
    BannerImage TEXT,
    BannerImage_mime_type VARCHAR(50),
    CHECK (BannerImage_mime_type IS NULL OR (mime_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')))  -- Image file path (e.g., '/images/pic.jpg'),
    BrochurePDF TEXT,
    BrochurePDF_mime_type VARCHAR(50),
    CHECK (BrochurePDF_mime_type IS NULL OR (mime_type = 'application/pdf'))  -- PDF file path (e.g., '/docs/report.pdf'),
    ManualDoc TEXT,
    ManualDoc_mime_type VARCHAR(50),
    CHECK (ManualDoc_mime_type IS NULL OR (mime_type IN ('application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain')))  -- Document file path (e.g., '/docs/note.docx'),
    PromoVideo TEXT,
    PromoVideo_mime_type VARCHAR(50),
    CHECK (PromoVideo_mime_type IS NULL OR (mime_type IN ('video/mp4', 'video/webm', 'video/ogg')))  -- Video file path (e.g., '/videos/clip.mp4'),
    ThemeAudio TEXT,
    ThemeAudio_mime_type VARCHAR(50),
    CHECK (ThemeAudio_mime_type IS NULL OR (mime_type IN ('audio/mpeg', 'audio/wav', 'audio/ogg')))  -- Audio file path (e.g., '/audio/song.mp3'),
    Visits BIGINT DEFAULT 0,
    FullName GENERATED ALWAYS AS (Name || ' Website') STORED,
    PRIMARY KEY (id),
    CHECK (Visits >= 0)
);
CREATE INDEX idx_email ON public.website_info (Email);
CREATE INDEX idx_name ON public.website_info (Name);
COMMENT ON TABLE public.website_info IS 'Stores website information and media files';
COMMENT ON COLUMN public.website_info.Name IS 'Website name';
COMMENT ON COLUMN public.website_info.Email IS 'Contact email';

CREATE TABLE public.Address (
    id SERIAL,
    hide BOOLEAN DEFAULT FALSE,
    delete BOOLEAN DEFAULT FALSE,
    web INTEGER REFERENCES website_info(id) ON DELETE CASCADE,
    Village VARCHAR(50),
    Road VARCHAR(50) NOT NULL,
    Population INTEGER,
    MapImage TEXT,
    MapImage_mime_type VARCHAR(50),
    CHECK (MapImage_mime_type IS NULL OR (mime_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')))  -- Image file path (e.g., '/images/pic.jpg'),
    PRIMARY KEY (id),
    FOREIGN KEY (web) REFERENCES website_info(id) ON DELETE CASCADE,
    CHECK (Population >= 0)
);
COMMENT ON TABLE public.Address IS 'Stores address details linked to websites';

CREATE TABLE public.website_categories (
    id SERIAL,
    hide BOOLEAN DEFAULT FALSE,
    delete BOOLEAN DEFAULT FALSE,
    website_id INTEGER REFERENCES website_info(id),
    category_id INTEGER REFERENCES categories(id),
    PRIMARY KEY (website_id, category_id)
);
COMMENT ON TABLE public.website_categories IS 'Junction table for website and category many-to-many relationship';

CREATE TABLE public.categories (
    id SERIAL,
    hide BOOLEAN DEFAULT FALSE,
    delete BOOLEAN DEFAULT FALSE,
    Name VARCHAR(50) UNIQUE,
    Description TEXT,
    PRIMARY KEY (id)
);
COMMENT ON TABLE public.categories IS 'Stores category definitions';