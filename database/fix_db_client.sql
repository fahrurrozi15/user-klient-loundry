-- ==============================================================================
-- PERBAIKAN DATABASE 1: db_client (Supabase Project 1)
-- Tujuan: Memperbaiki semua masalah RLS, Trigger, Kolom QRIS & Custom Paket
-- Jalankan script ini di SQL Editor Supabase Project 1 (db_client)
-- ==============================================================================

-- 1. FUNGSI LOG TRACKING DENGAN SECURITY DEFINER
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

-- 2. TRIGGER TRACKING DIPASANG SEBAGAI 'AFTER' INSERT / UPDATE
DROP TRIGGER IF EXISTS trg_order_status_tracking ON public.client_orders;
CREATE TRIGGER trg_order_status_tracking
AFTER INSERT OR UPDATE OF status ON public.client_orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_order_tracking();

-- 3. TRIGGER UNTUK UPDATE OTOMATIS updated_at PADA client_orders
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

-- 4. KOLOM TAMBAHAN UNTUK PEMBAYARAN & QRIS
ALTER TABLE public.client_orders 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'CASH',
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'UNPAID',
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_weight_kg NUMERIC(6, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS piece_count INT DEFAULT 0;

-- 5. TABEL APP_SETTINGS (FOTO QRIS & PENGATURAN OUTLET)
CREATE TABLE IF NOT EXISTS public.app_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. PERBAIKAN RLS POLICIES PADA db_client
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Policy untuk service_packages (Bisa dibaca publik, bisa dikelola kasir/admin)
DROP POLICY IF EXISTS "Public read packages" ON public.service_packages;
DROP POLICY IF EXISTS "Allow manage packages" ON public.service_packages;
CREATE POLICY "Public read packages" ON public.service_packages FOR SELECT USING (true);
CREATE POLICY "Allow manage packages" ON public.service_packages FOR ALL USING (true) WITH CHECK (true);

-- Policy untuk client_orders
DROP POLICY IF EXISTS "Public create orders" ON public.client_orders;
DROP POLICY IF EXISTS "Public read orders" ON public.client_orders;
DROP POLICY IF EXISTS "Allow update orders" ON public.client_orders;
DROP POLICY IF EXISTS "Public update orders" ON public.client_orders;

CREATE POLICY "Public create orders" ON public.client_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read orders" ON public.client_orders FOR SELECT USING (true);
CREATE POLICY "Allow update orders" ON public.client_orders FOR UPDATE USING (true) WITH CHECK (true);

-- Policy untuk order_tracking (Baca dan Tambah)
DROP POLICY IF EXISTS "Public read tracking" ON public.order_tracking;
DROP POLICY IF EXISTS "Public insert tracking" ON public.order_tracking;

CREATE POLICY "Public read tracking" ON public.order_tracking FOR SELECT USING (true);
CREATE POLICY "Public insert tracking" ON public.order_tracking FOR INSERT WITH CHECK (true);

-- Policy untuk app_settings (QRIS upload)
DROP POLICY IF EXISTS "Allow all on app_settings" ON public.app_settings;
CREATE POLICY "Allow all on app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- 7. REPLIKASI REALTIME (Auto-refresh seketika)
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_tracking;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_packages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;

-- 8. DEFAULT QRIS
INSERT INTO public.app_settings (key, value)
VALUES 
    ('qris_merchant_name', 'AURA LAUNDRY OFFICIAL'),
    ('qris_nmid', 'ID102030405060')
ON CONFLICT (key) DO NOTHING;

-- Verifikasi hasil
SELECT schemaname, tablename, policyname, cmd, permissive
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('client_orders', 'order_tracking', 'service_packages', 'app_settings')
ORDER BY tablename, cmd;
