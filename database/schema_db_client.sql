-- ==============================================================================
-- DATABASE 1: db_client (Supabase Project 1 - Public & Customer Domain)
-- Deskripsi: Menyimpan data layanan, pesanan masuk pelanggan, dan tracking resi
-- ==============================================================================

-- 1. EXTENSION
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABEL: service_packages (Katalog Paket Layanan Laundry)
CREATE TABLE IF NOT EXISTS public.service_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    service_type VARCHAR(20) NOT NULL CHECK (service_type IN ('kiloan', 'satuan', 'express')),
    price_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    unit_name VARCHAR(20) NOT NULL DEFAULT 'KG',
    estimated_duration_hours INT NOT NULL DEFAULT 48,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Data Layanan Laundry
INSERT INTO public.service_packages (name, slug, description, service_type, price_per_unit, unit_name, estimated_duration_hours)
VALUES 
    ('Cuci Komplit Reguler', 'cuci-komplit-reguler', 'Cuci, pengeringan, dan setrika uap rapi wangi tahan lama.', 'kiloan', 8000, 'KG', 48),
    ('Cuci Kering Lipat', 'cuci-kering-lipat', 'Cuci dan pengeringan higienis mesin komersial tanpa setrika.', 'kiloan', 6000, 'KG', 24),
    ('Setrika Uap Kilat', 'setrika-uap-kilat', 'Setrika uap rapi khusus pakaian yang sudah bersih.', 'kiloan', 5000, 'KG', 24),
    ('Express Same-Day', 'express-same-day', 'Layanan cuci kilat selesai di hari yang sama (6-8 jam).', 'express', 15000, 'KG', 8),
    ('Jas / Blazer', 'jas-blazer', 'Dry clean khusus pakaian formal dengan pelindung jas gantung.', 'satuan', 25000, 'PCS', 48),
    ('Bed Cover King/Queen', 'bed-cover-king-queen', 'Pembersihan menyeluruh bed cover ukuran tebal.', 'satuan', 35000, 'PCS', 48)
ON CONFLICT (slug) DO NOTHING;

-- 3. TABEL: client_orders (Pesanan Masuk dari Pelanggan)
CREATE TABLE IF NOT EXISTS public.client_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_code VARCHAR(30) UNIQUE NOT NULL, -- Format: LND-YYYYMMDD-XXXX
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_address TEXT NOT NULL,
    delivery_type VARCHAR(20) NOT NULL DEFAULT 'pickup_delivery' 
        CHECK (delivery_type IN ('pickup_delivery', 'dropoff_pickup', 'pickup_only')),
    service_package_id UUID REFERENCES public.service_packages(id) ON DELETE SET NULL,
    service_name VARCHAR(100) NOT NULL,
    estimated_weight_kg NUMERIC(6, 2) DEFAULT 0,
    customer_notes TEXT,
    piece_count INT DEFAULT 0,
    payment_proof_url TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ORDER_RECEIVED' 
        CHECK (status IN (
            'ORDER_RECEIVED',      -- Pelanggan baru kirim pesanan
            'COURIER_PICKUP',      -- Kurir otw jemput
            'IN_LAUNDRY',          -- Tiba di outlet & ditimbang
            'WASHING_DRYING',      -- Sedang dicuci / dikeringkan
            'IRONING',             -- Sedang disetrika
            'READY_FOR_DELIVERY',  -- Bersih, siap diantar / diambil
            'COMPLETED',           -- Selesai diterima pelanggan
            'CANCELLED'            -- Dibatalkan
        )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_orders_code ON public.client_orders(order_code);
CREATE INDEX IF NOT EXISTS idx_client_orders_status ON public.client_orders(status);

-- 4. TABEL: order_tracking (Log Perjalanan Status Pesanan)
CREATE TABLE IF NOT EXISTS public.order_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.client_orders(id) ON DELETE CASCADE,
    order_code VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    status_title VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_tracking_code ON public.order_tracking(order_code);

-- 5. TRIGGER: Auto-catat Tracking Riwayat Setiap Status Berubah
CREATE OR REPLACE FUNCTION public.fn_log_order_tracking()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    title_text VARCHAR(100);
    desc_text TEXT;
BEGIN
    IF (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status) THEN
        CASE NEW.status
            WHEN 'ORDER_RECEIVED' THEN
                title_text := 'Pesanan Diterima Sistem';
                desc_text := 'Pesanan berhasil terdaftar, menunggu jadwal jemput atau kedatangan.';
            WHEN 'COURIER_PICKUP' THEN
                title_text := 'Kurir Menuju Lokasi';
                desc_text := 'Kurir kami sedang dalam perjalanan untuk mengambil pakaian kotor Anda.';
            WHEN 'IN_LAUNDRY' THEN
                title_text := 'Tiba di Outlet & Ditimbang';
                desc_text := 'Pakaian telah tiba di outlet dan ditimbang oleh kasir.';
            WHEN 'WASHING_DRYING' THEN
                title_text := 'Proses Cuci & Kering';
                desc_text := 'Pakaian sedang dicuci menggunakan detergen higienis dan dikeringkan.';
            WHEN 'IRONING' THEN
                title_text := 'Proses Setrika Uap';
                desc_text := 'Pakaian disetrika rapi, disemprot parfum laundry tahan lama, dan di-packing rapi.';
            WHEN 'READY_FOR_DELIVERY' THEN
                title_text := 'Siap Diantar / Diambil';
                desc_text := 'Cucian bersih Anda siap diambil di outlet atau sedang dijadwalkan antar.';
            WHEN 'COMPLETED' THEN
                title_text := 'Transaksi Selesai';
                desc_text := 'Pakaian bersih telah diterima pelanggan. Terima kasih!';
            WHEN 'CANCELLED' THEN
                title_text := 'Pesanan Dibatalkan';
                desc_text := 'Pesanan telah dibatalkan.';
            ELSE
                title_text := 'Pembaruan Status';
                desc_text := 'Status pesanan berubah menjadi ' || NEW.status;
        END CASE;

        INSERT INTO public.order_tracking (order_id, order_code, status, status_title, description, created_at)
        VALUES (NEW.id, NEW.order_code, NEW.status, title_text, desc_text, NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_status_tracking ON public.client_orders;
CREATE TRIGGER trg_order_status_tracking
AFTER INSERT OR UPDATE OF status ON public.client_orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_order_tracking();

-- Trigger untuk update updated_at
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_orders_updated_at ON public.client_orders;
CREATE TRIGGER trg_client_orders_updated_at
BEFORE UPDATE ON public.client_orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_set_updated_at();

-- 6. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read packages" ON public.service_packages FOR SELECT USING (true);
CREATE POLICY "Public create orders" ON public.client_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read orders" ON public.client_orders FOR SELECT USING (true);
CREATE POLICY "Allow update orders" ON public.client_orders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public read tracking" ON public.order_tracking FOR SELECT USING (true);
CREATE POLICY "Public insert tracking" ON public.order_tracking FOR INSERT WITH CHECK (true);
