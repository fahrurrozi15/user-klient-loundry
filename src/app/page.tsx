'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  PackageCheck,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  RefreshCw,
  QrCode,
  Banknote,
  Download,
  UploadCloud,
  ImageIcon,
  FileCheck
} from 'lucide-react';
import { ServicePackage, ClientOrder, OrderTracking, OrderStatus } from '@/types/database';
import {
  getServicePackages,
  createClientOrder,
  getOrderTrackingByCode,
  getClientQRIS,
  ClientQRIS,
  DEFAULT_CLIENT_QRIS,
  subscribeToClientUpdates,
  uploadPaymentProof,
  compressImageFile
} from '@/lib/supabase';

export default function ClientHomePage() {
  const [services, setServices] = useState<ServicePackage[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'kiloan' | 'satuan' | 'express'>('all');
  const [loadingServices, setLoadingServices] = useState(true);
  const [clientQRIS, setClientQRIS] = useState<ClientQRIS>(DEFAULT_CLIENT_QRIS);

  // Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [deliveryType, setDeliveryType] = useState<'pickup_delivery' | 'dropoff_pickup'>('pickup_delivery');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [estimatedWeight, setEstimatedWeight] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'QRIS' | 'CASH'>('QRIS');
  const [customerNotes, setCustomerNotes] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ orderCode: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Tracking State
  const [searchCode, setSearchCode] = useState('');
  const [searchingTracking, setSearchingTracking] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<ClientOrder | null>(null);
  const [trackingTimeline, setTrackingTimeline] = useState<OrderTracking[]>([]);
  const [trackingSearched, setTrackingSearched] = useState(false);
  const [copiedResi, setCopiedResi] = useState(false);
  const activeSearchCodeRef = useRef<string>('');

  // Payment Proof Upload State
  const [proofImageFile, setProofImageFile] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const [reuploadMode, setReuploadMode] = useState(false);

  // Initial load
  useEffect(() => {
    let ignore = false;
    (async () => {
      const [pkgs, qris] = await Promise.all([
        getServicePackages(),
        getClientQRIS(),
      ]);
      if (!ignore) {
        setServices(pkgs);
        setClientQRIS(qris);
        if (pkgs.length > 0) {
          setSelectedServiceId(pkgs[0].id);
        }
        setLoadingServices(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // AUTO REFRESH / REALTIME SUBSCRIPTION
  useEffect(() => {
    const unsubscribe = subscribeToClientUpdates(async () => {
      // 1. Silent refresh katalog paket
      const pkgs = await getServicePackages();
      setServices(pkgs);

      // 2. Silent refresh foto QRIS
      const qris = await getClientQRIS();
      setClientQRIS(qris);

      // 3. Silent refresh pelacakan resi jika user sedang melihat resi
      if (activeSearchCodeRef.current) {
        const res = await getOrderTrackingByCode(activeSearchCodeRef.current);
        if (res.order) {
          setTrackedOrder(res.order);
          setTrackingTimeline(res.tracking);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const filteredServices = services.filter((s) => {
    if (selectedCategory === 'all') return true;
    return s.service_type === selectedCategory;
  });

  const selectedService = services.find((s) => s.id === selectedServiceId);

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim()) {
      setFormError('Mohon lengkapi Nama, No. WhatsApp, dan Alamat penjemputan.');
      return;
    }

    if (!selectedService) {
      setFormError('Silakan pilih salah satu paket layanan.');
      return;
    }

    setSubmittingOrder(true);
    const result = await createClientOrder({
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      delivery_type: deliveryType,
      service_package_id: selectedService.id,
      service_name: selectedService.name,
      estimated_weight_kg: Number(estimatedWeight) || 0,
      payment_method: paymentMethod,
      customer_notes: customerNotes,
    });

    setSubmittingOrder(false);

    if (result.success && result.order_code) {
      setOrderSuccess({ orderCode: result.order_code });
      // Reset form fields
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setEstimatedWeight('');
      setCustomerNotes('');
    } else {
      setFormError(result.message?.includes('violates row-level security')
        ? 'Mohon maaf, terjadi kendala teknis pada sistem. Silakan coba beberapa saat lagi atau hubungi admin.'
        : result.message || 'Gagal mengirim pesanan. Silakan coba lagi.');
    }
  };

  const handleSearchTracking = async (codeToSearch?: string) => {
    const code = (codeToSearch || searchCode).trim().toUpperCase();
    if (!code) return;

    activeSearchCodeRef.current = code;
    setSearchingTracking(true);
    setTrackingSearched(true);
    const result = await getOrderTrackingByCode(code);
    setTrackedOrder(result.order);
    setTrackingTimeline(result.tracking);
    setSearchingTracking(false);

    // Scroll smoothly to tracking result
    const el = document.getElementById('tracking-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedResi(true);
    setTimeout(() => setCopiedResi(false), 2000);
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'ORDER_RECEIVED':
        return <span className="bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full">Pesanan Masuk</span>;
      case 'COURIER_PICKUP':
        return <span className="bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full">Penjemputan Kurir</span>;
      case 'IN_LAUNDRY':
        return <span className="bg-teal-50 text-teal-800 border border-teal-200 px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full">Tiba di Outlet</span>;
      case 'WASHING_DRYING':
        return <span className="bg-cyan-50 text-cyan-800 border border-cyan-200 px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full">Proses Cuci</span>;
      case 'IRONING':
        return <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full">Setrika & Packing</span>;
      case 'READY_FOR_DELIVERY':
        return <span className="bg-purple-50 text-purple-800 border border-purple-200 px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full">Siap Diantar</span>;
      case 'COMPLETED':
        return <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full">Selesai</span>;
      case 'CANCELLED':
        return <span className="bg-rose-50 text-rose-800 border border-rose-200 px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full">Dibatalkan</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 px-3 py-1 text-xs font-semibold uppercase rounded-full">{status}</span>;
    }
  };

  const handleProofFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Mohon pilih file gambar (JPG, PNG, WebP).');
      return;
    }

    try {
      // Kompres otomatis gambar agar ringan (~80KB) dan proses kirim instan
      const compressed = await compressImageFile(file, 900, 0.75);
      setProofImageFile(compressed);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setProofImageFile(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadProofSubmit = async () => {
    if (!trackedOrder || !proofImageFile) return;
    setUploadingProof(true);
    setUploadSuccessMessage(null);
    const sentProof = proofImageFile;

    const res = await uploadPaymentProof(trackedOrder.order_code, sentProof);
    setUploadingProof(false);
    if (res.success) {
      const finalUrl = res.publicUrl || sentProof;
      setUploadSuccessMessage('Bukti pembayaran berhasil disimpan ke Supabase Storage! Menunggu verifikasi kasir.');
      setProofImageFile(null); // Bersihkan draft agar tidak menggantung
      setReuploadMode(false);
      
      // Update state seketika
      setTrackedOrder((prev) => (prev ? { ...prev, payment_proof_url: finalUrl } : null));

      // Refresh data database secara aman tanpa menimpa bukti jika DB belum sync
      const refreshed = await getOrderTrackingByCode(trackedOrder.order_code);
      if (refreshed.order) {
        setTrackedOrder({
          ...refreshed.order,
          payment_proof_url: refreshed.order.payment_proof_url || finalUrl,
        });
        setTrackingTimeline(refreshed.tracking);
      }
    } else {
      alert('Gagal mengunggah bukti pembayaran.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans" suppressHydrationWarning>
      {/* Main Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-black text-white p-2.5 rounded-xl shadow-xs">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-slate-900">AURA LAUNDRY</span>
              <span className="hidden sm:inline-block ml-2 text-xs font-semibold text-slate-500 uppercase tracking-widest border-l pl-2 border-slate-300">
                Client Portal
              </span>
            </div>
          </div>

          {/* Quick Resi Tracker in Navbar */}
          <div className="flex items-center gap-2 max-w-xs w-full">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="LND-XXXXXXXX..."
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchTracking()}
                className="w-full bg-slate-100/80 border border-slate-200/80 rounded-full px-4 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-black focus:ring-1 focus:ring-black uppercase transition"
              />
            </div>
            <button
              onClick={() => handleSearchTracking()}
              disabled={searchingTracking}
              className="bg-black hover:bg-neutral-800 active:scale-95 text-white px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 shadow-xs transition"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lacak</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="max-w-6xl mx-auto px-4 py-8 flex-1 w-full space-y-12">
        
        {/* Section 1: Tracking Status Result */}
        <section id="tracking-section" className="scroll-mt-20">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Search className="w-5 h-5 text-slate-700" />
                Portal Pelacakan Resi Laundry
              </h2>
              <p className="text-slate-500 text-xs mt-0.5">
                Masukkan kode order (contoh: <button onClick={() => { setSearchCode('LND-20261103-0001'); handleSearchTracking('LND-20261103-0001'); }} className="text-slate-800 hover:text-black font-semibold underline font-mono">LND-20261103-0001</button>) untuk melihat progres cucian Anda.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Nomor Resi (LND-...)"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm w-full sm:w-64 uppercase focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition"
              />
              <button
                onClick={() => handleSearchTracking()}
                disabled={searchingTracking}
                className="bg-black hover:bg-neutral-800 active:scale-95 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shrink-0 shadow-xs hover:shadow transition"
              >
                {searchingTracking ? 'Mencari...' : 'Periksa'}
              </button>
            </div>
          </div>

          {/* Tracking Card Display */}
          {trackingSearched && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-sm">
              {trackedOrder ? (
                <div className="space-y-6">
                  {/* Order Summary Header */}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-200">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-bold text-slate-900">{trackedOrder.order_code}</span>
                        {getStatusBadge(trackedOrder.status)}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Dibuat pada: {new Date(trackedOrder.created_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 block">Pelanggan</span>
                        <span className="font-semibold text-slate-800">{trackedOrder.customer_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Layanan</span>
                        <span className="font-semibold text-slate-800">{trackedOrder.service_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Estimasi Berat</span>
                        <span className="font-semibold text-slate-800">{trackedOrder.estimated_weight_kg ? `${trackedOrder.estimated_weight_kg} KG` : '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* KOTAK STATUS PEMBAYARAN & QRIS INTERAKTIF */}
                  {(() => {
                    const isQRIS = trackedOrder.payment_method === 'QRIS' || (trackedOrder.customer_notes && trackedOrder.customer_notes.includes('QRIS'));
                    const isPaid = trackedOrder.payment_status === 'PAID';
                    const hasBill = (trackedOrder.total_amount && trackedOrder.total_amount > 0) || (trackedOrder.actual_weight_kg && trackedOrder.actual_weight_kg > 0);

                    if (isPaid) {
                      return (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                              <CheckCircle2 className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-emerald-900 text-sm">PEMBAYARAN LUNAS</span>
                                <span className="bg-emerald-200 text-emerald-900 text-[10px] font-bold px-2 py-0.5 rounded">
                                  {isQRIS ? 'QRIS' : 'TUNAI'}
                                </span>
                              </div>
                              <p className="text-xs text-emerald-700 mt-0.5">
                                Tagihan Rp {(trackedOrder.total_amount || 0).toLocaleString('id-ID')} telah berhasil diverifikasi oleh kasir.
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-emerald-800 font-mono font-bold bg-white px-3 py-1.5 rounded border border-emerald-200">
                            Status: Selesai Bayar
                          </span>
                        </div>
                      );
                    }

                    if (isQRIS && hasBill) {
                      return (
                        <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-5">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-4 border-b border-slate-200/80">
                            <div>
                              <div className="flex items-center gap-2.5">
                                <span className="bg-black text-white p-2 rounded-xl shadow-xs">
                                  <QrCode className="w-4 h-4" />
                                </span>
                                <span className="font-extrabold text-slate-900 text-base">TAGIHAN SIAP &bull; SILAKAN SCAN QRIS</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                Pakaian telah ditimbang oleh kasir di outlet. Silakan selesaikan pembayaran via QRIS.
                              </p>
                            </div>
                            <span className="bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold px-3 py-1 rounded-full">
                              Menunggu Pembayaran
                            </span>
                          </div>

                          <div className="grid md:grid-cols-2 gap-6 items-center">
                            {/* Rincian Tagihan */}
                            <div className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs text-xs">
                              <div className="flex justify-between py-1.5 border-b border-slate-100">
                                <span className="text-slate-500">Berat Aktual Timbangan:</span>
                                <span className="font-bold text-slate-800 font-mono text-sm">
                                  {trackedOrder.actual_weight_kg || trackedOrder.estimated_weight_kg} KG
                                </span>
                              </div>
                              <div className="flex justify-between py-1.5 border-b border-slate-100">
                                <span className="text-slate-500">Metode Pembayaran:</span>
                                <span className="font-bold text-slate-900">QRIS Dinamis</span>
                              </div>
                              <div className="flex justify-between py-2 text-sm font-extrabold text-slate-900 pt-1">
                                <span>TOTAL PEMBAYARAN:</span>
                                <span className="text-2xl text-slate-900 font-mono font-extrabold">
                                  Rp {(trackedOrder.total_amount || 0).toLocaleString('id-ID')}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 italic pt-1">
                                *Setelah melakukan pembayaran, kasir akan memverifikasi bukti transfer dan status berubah menjadi LUNAS.
                              </p>
                            </div>

                            {/* Tampilan QRIS */}
                            <div className="text-center p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs space-y-2.5">
                              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                                {clientQRIS.merchant_name}
                              </span>
                              <div className="inline-block p-2.5 bg-slate-50 rounded-xl border border-slate-200 shadow-2xs">
                                <img
                                  src={clientQRIS.image_url}
                                  alt="QRIS Pembayaran Laundry"
                                  className="w-40 h-40 object-contain mx-auto rounded-lg"
                                />
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {clientQRIS.info || 'Scan dengan GoPay, OVO, Dana, ShopeePay, BCA, Livin, dll.'}
                              </p>
                              {clientQRIS.image_url && (
                                <a
                                  href={clientQRIS.image_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-950 font-semibold underline"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Unduh / Buka Gambar QRIS
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Bagian Bukti Transfer / Pembayaran */}
                          <div className="pt-3 border-t border-slate-200/80">
                            {trackedOrder.payment_proof_url && !reuploadMode ? (
                              <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-16 h-16 rounded-xl border border-emerald-300 overflow-hidden bg-white shrink-0 shadow-2xs">
                                    <img
                                      src={trackedOrder.payment_proof_url}
                                      alt="Bukti Transfer Klien"
                                      className="w-full h-full object-cover cursor-pointer hover:opacity-90"
                                      onClick={() => window.open(trackedOrder.payment_proof_url, '_blank')}
                                      title="Klik untuk melihat bukti transfer penuh"
                                    />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                                      <FileCheck className="w-4 h-4 text-emerald-600" />
                                      <span>Bukti Transfer Telah Dikirim</span>
                                    </div>
                                    <p className="text-xs text-emerald-700 mt-0.5">
                                      Status: <span className="font-semibold underline">Menunggu kasir memeriksa & meng-acc pembayaran.</span>
                                    </p>
                                    <span className="text-[11px] text-slate-500 block mt-0.5">
                                      Klik foto bukti untuk membuka ukuran penuh.
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => { setReuploadMode(true); setProofImageFile(null); }}
                                  className="text-xs text-white bg-black hover:bg-neutral-800 px-3.5 py-1.5 rounded-xl font-medium transition shrink-0 shadow-xs"
                                >
                                  Ganti Foto Bukti
                                </button>
                              </div>
                            ) : (
                              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-3.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                                    <UploadCloud className="w-4 h-4 text-slate-700" />
                                    <span>Unggah Bukti Transfer / Pembayaran</span>
                                  </div>
                                  {reuploadMode && (
                                    <button
                                      type="button"
                                      onClick={() => setReuploadMode(false)}
                                      className="text-xs text-slate-500 hover:text-black"
                                    >
                                      Batal
                                    </button>
                                  )}
                                </div>

                                <p className="text-xs text-slate-500 leading-relaxed">
                                  Setelah Anda mentransfer nominal <strong className="text-slate-900">Rp {(trackedOrder.total_amount || 0).toLocaleString('id-ID')}</strong> ke QRIS di atas, silakan unggah tangkapan layar (screenshot) atau foto bukti transaksi di bawah ini agar kasir dapat memeriksa dan meng-acc pesanan Anda.
                                </p>

                                <div className="flex flex-col sm:flex-row items-center gap-3">
                                  <label className="flex-1 w-full sm:w-auto flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-black bg-slate-50/60 hover:bg-slate-100 rounded-xl p-3 cursor-pointer transition text-xs text-slate-700 font-medium">
                                    <ImageIcon className="w-4 h-4 text-slate-500" />
                                    <span>{proofImageFile ? 'Ganti Foto Terpilih' : 'Pilih Foto / Screenshot Bukti'}</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={handleProofFileChange}
                                      className="hidden"
                                    />
                                  </label>

                                  {proofImageFile && (
                                    <div className="flex items-center gap-2.5 shrink-0">
                                      <img
                                        src={proofImageFile}
                                        alt="Preview"
                                        className="w-11 h-11 object-cover rounded-xl border border-slate-200 shadow-2xs"
                                      />
                                      <button
                                        type="button"
                                        onClick={handleUploadProofSubmit}
                                        disabled={uploadingProof}
                                        className="bg-black hover:bg-neutral-800 active:scale-95 disabled:bg-neutral-400 text-white px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition shadow-xs"
                                      >
                                        {uploadingProof ? (
                                          <>
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            Mengirim...
                                          </>
                                        ) : (
                                          <>
                                            <UploadCloud className="w-3.5 h-3.5" />
                                            Kirim Bukti Pembayaran
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {uploadSuccessMessage && (
                                  <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span>{uploadSuccessMessage}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (isQRIS && !hasBill) {
                      return (
                        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-5 flex items-start gap-3.5 shadow-2xs">
                          <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-amber-950 text-sm">MENUNGGU HASIL TIMBANGAN OUTLET (QRIS)</span>
                              <span className="bg-amber-100 text-amber-900 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-amber-200">
                                Menunggu Timbangan
                              </span>
                            </div>
                            <p className="text-xs text-amber-900/80 mt-1 leading-relaxed">
                              Pakaian Anda sedang dalam penjemputan atau antrean timbangan di outlet. Setelah kasir menimbang pakaian, total pembayaran riil dan kode QRIS akan langsung muncul di sini secara otomatis.
                            </p>
                          </div>
                        </div>
                      );
                    }

                    // CASH (Tunai)
                    return (
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                            <Banknote className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block text-sm">Metode Pembayaran: Tunai (CASH)</span>
                            <span className="text-slate-500 text-xs mt-0.5 block">
                              Silakan bayar tunai langsung saat kurir menjemput atau saat pengambilan cucian di outlet.
                            </span>
                          </div>
                        </div>
                        <span className="bg-slate-100 text-slate-700 font-semibold text-xs px-3 py-1 rounded-full border border-slate-200 shrink-0">
                          Belum Bayar
                        </span>
                      </div>
                    );
                  })()}

                  {/* Horizontal / Vertical Progress Timeline */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                      Riwayat Perjalanan Cucian
                    </h3>

                    {trackingTimeline.length > 0 ? (
                      <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                        {trackingTimeline.map((item, idx) => {
                          const isLatest = idx === trackingTimeline.length - 1;
                          return (
                            <div key={item.id || idx} className="relative">
                              <span
                                className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 bg-white ${
                                  isLatest ? 'border-emerald-600 bg-emerald-600 ring-4 ring-emerald-100' : 'border-slate-300'
                                }`}
                              />
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                <span className={`text-sm font-semibold ${isLatest ? 'text-emerald-700 font-bold' : 'text-slate-800'}`}>
                                  {item.status_title}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {new Date(item.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                                </span>
                              </div>
                              {item.description && (
                                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">Belum ada riwayat pergerakan status untuk order ini.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center space-y-2">
                  <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-800">Nomor Resi Tidak Ditemukan</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Periksa kembali nomor resi yang Anda masukkan atau hubungi admin laundry jika pesanan baru saja dibuat.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Section 2: Service Packages Catalog */}
        <section id="services-catalog">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
            <div>
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Katalog Layanan</div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">Pilihan Paket & Tarif Resmi</h2>
              <p className="text-slate-500 text-xs mt-1">Transparan, tanpa biaya tersembunyi. Timbang akurat di outlet.</p>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-full text-xs font-medium">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-1.5 rounded-full transition ${selectedCategory === 'all' ? 'bg-black text-white shadow-xs font-semibold' : 'text-slate-600 hover:text-black'}`}
              >
                Semua
              </button>
              <button
                onClick={() => setSelectedCategory('kiloan')}
                className={`px-4 py-1.5 rounded-full transition ${selectedCategory === 'kiloan' ? 'bg-black text-white shadow-xs font-semibold' : 'text-slate-600 hover:text-black'}`}
              >
                Kiloan
              </button>
              <button
                onClick={() => setSelectedCategory('express')}
                className={`px-4 py-1.5 rounded-full transition ${selectedCategory === 'express' ? 'bg-black text-white shadow-xs font-semibold' : 'text-slate-600 hover:text-black'}`}
              >
                Express
              </button>
              <button
                onClick={() => setSelectedCategory('satuan')}
                className={`px-4 py-1.5 rounded-full transition ${selectedCategory === 'satuan' ? 'bg-black text-white shadow-xs font-semibold' : 'text-slate-600 hover:text-black'}`}
              >
                Satuan
              </button>
            </div>
          </div>

          {/* Service Cards Grid */}
          {loadingServices ? (
            <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-slate-600" />
              <span>Memuat katalog paket layanan...</span>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-5">
              {filteredServices.map((pkg) => {
                const isSelected = selectedServiceId === pkg.id;
                return (
                  <div
                    key={pkg.id}
                    className={`rounded-2xl p-6 bg-white transition-all duration-200 flex flex-col justify-between ${
                      isSelected
                        ? 'border-2 border-black shadow-md ring-2 ring-black/10'
                        : 'border border-slate-200/80 hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[11px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/60">
                          {pkg.service_type}
                        </span>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {pkg.estimated_duration_hours} Jam
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 text-base">{pkg.name}</h3>
                      <p className="text-slate-600 text-xs leading-relaxed">{pkg.description}</p>
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 text-[10px] block font-medium">Tarif Layanan</span>
                        <span className="font-extrabold text-lg text-slate-900">
                          Rp {Number(pkg.price_per_unit).toLocaleString('id-ID')}
                        </span>
                        <span className="text-xs text-slate-500 font-medium"> / {pkg.unit_name}</span>
                      </div>

                      <a
                        href="#order-form"
                        onClick={() => setSelectedServiceId(pkg.id)}
                        className="text-xs font-semibold px-4 py-2 rounded-xl transition bg-black hover:bg-neutral-800 text-white shadow-xs"
                      >
                        {isSelected ? 'Terpilih' : 'Pilih Paket'}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 3: Order Form */}
        <section id="order-form" className="scroll-mt-20">
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-10 shadow-sm">
            <div className="max-w-2xl mb-8">
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Formulir Pesanan Pelanggan</div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">Minta Penjemputan / Antar Cucian</h2>
            </div>

            {/* Error Banner */}
            {formError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Success Modal / Banner */}
            {orderSuccess ? (
              <div className="p-8 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-center space-y-4">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-emerald-950">Pesanan Berhasil Terdaftar!</h3>
                  <p className="text-xs text-emerald-700 mt-1 max-w-md mx-auto">
                    Simpan kode resi ini untuk melacak status penjemputan dan proses pencucian pakaian Anda.
                  </p>
                </div>

                <div className="inline-flex items-center gap-2 bg-white border border-emerald-300 px-5 py-2.5 rounded-xl font-mono text-base font-bold text-slate-900 shadow-xs">
                  <span>{orderSuccess.orderCode}</span>
                  <button
                    onClick={() => copyToClipboard(orderSuccess.orderCode)}
                    className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition"
                    title="Salin Resi"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                {copiedResi && <div className="text-[11px] text-emerald-700 font-medium">Kode resi berhasil disalin ke clipboard!</div>}

                <div className="pt-2 flex justify-center gap-3">
                  <button
                    onClick={() => {
                      setSearchCode(orderSuccess.orderCode);
                      handleSearchTracking(orderSuccess.orderCode);
                      setOrderSuccess(null);
                    }}
                    className="bg-black hover:bg-neutral-800 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition shadow-xs"
                  >
                    Lihat Status Resi
                  </button>
                  <button
                    onClick={() => setOrderSuccess(null)}
                    className="bg-black hover:bg-neutral-800 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition shadow-xs"
                  >
                    Buat Pesanan Baru
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleOrderSubmit} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-5">
                  {/* Nama Pelanggan */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Nama Lengkap <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Rian Pratama"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition"
                    />
                  </div>

                  {/* No. WhatsApp */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Nomor WhatsApp (Aktif) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="Contoh: 081234567890"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition"
                    />
                  </div>
                </div>

                {/* Alamat Lengkap */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Alamat Penjemputan / Pengantaran <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Nama jalan, nomor rumah/kost, RT/RW, kelurahan, dan patokan..."
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  {/* Pilihan Layanan */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Pilihan Layanan Laundry <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedServiceId}
                      onChange={(e) => setSelectedServiceId(e.target.value)}
                      className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition cursor-pointer"
                    >
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} - Rp {Number(s.price_per_unit).toLocaleString('id-ID')}/{s.unit_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tipe Penjemputan */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Metode Pengambilan
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setDeliveryType('pickup_delivery')}
                        className={`text-xs py-2.5 px-3 rounded-xl border font-semibold transition text-center ${
                          deliveryType === 'pickup_delivery'
                            ? 'bg-black text-white border-black shadow-xs'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Antar-Jemput Kurir
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeliveryType('dropoff_pickup')}
                        className={`text-xs py-2.5 px-3 rounded-xl border font-semibold transition text-center ${
                          deliveryType === 'dropoff_pickup'
                            ? 'bg-black text-white border-black shadow-xs'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Antar Sendiri ke Outlet
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  {/* Estimasi Berat */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Estimasi Berat / Jumlah Pakaian (Opsional)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        placeholder="Contoh: 3.5"
                        value={estimatedWeight}
                        onChange={(e) => setEstimatedWeight(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition"
                      />
                      <span className="absolute right-4 top-2.5 text-xs text-slate-400 font-semibold">
                        {selectedService?.unit_name || 'KG'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      *Timbangan akurat akan dilakukan oleh kasir saat pakaian tiba di outlet.
                    </span>
                  </div>

                  {/* Catatan Khusus */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Catatan Khusus untuk Cucian
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Baju kemeja jangan disatukan dengan baju luntur..."
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition"
                    />
                  </div>
                </div>

                {/* Metode Pembayaran: Hanya CASH dan QRIS */}
                <div className="space-y-3 p-5 bg-slate-50/70 border border-slate-200/90 rounded-2xl">
                  <label className="text-xs font-bold text-slate-800 block">
                    Pilihan Metode Pembayaran <span className="text-red-500">*</span>
                  </label>
                  <div className="grid sm:grid-cols-2 gap-3.5">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('QRIS')}
                      className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 ${
                        paymentMethod === 'QRIS'
                          ? 'bg-white border-black text-slate-950 ring-2 ring-black/10 shadow-xs'
                          : 'bg-white/80 border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`p-2.5 rounded-xl shrink-0 transition ${paymentMethod === 'QRIS' ? 'bg-black text-white' : 'bg-slate-100 text-slate-600'}`}>
                        <QrCode className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold block">QRIS (Scan QR Dinamis)</span>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          GoPay, OVO, Dana, ShopeePay, BCA, Livin, dll.
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CASH')}
                      className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 ${
                        paymentMethod === 'CASH'
                          ? 'bg-white border-black text-slate-950 ring-2 ring-black/10 shadow-xs'
                          : 'bg-white/80 border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`p-2.5 rounded-xl shrink-0 transition ${paymentMethod === 'CASH' ? 'bg-black text-white' : 'bg-slate-100 text-slate-600'}`}>
                        <Banknote className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold block">Tunai (CASH)</span>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          Bayar tunai di outlet atau langsung ke kurir jemput.
                        </span>
                      </div>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {paymentMethod === 'QRIS'
                      ? '💡 Untuk pembayaran QRIS, nominal total tagihan final akan dihitung dan diunggah kasir setelah pakaian ditimbang di outlet. Anda dapat scan QRIS langsung di portal resi ini.'
                      : '💡 Pembayaran tunai dilakukan langsung saat kurir menjemput cucian atau saat pengambilan di outlet.'}
                  </p>
                </div>

                {/* Submit Action */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submittingOrder}
                    className="w-full sm:w-auto bg-black hover:bg-neutral-800 active:scale-[0.99] disabled:bg-neutral-400 text-white font-semibold text-sm px-8 py-3 rounded-xl transition-all shadow-sm hover:shadow flex items-center justify-center gap-2"
                  >
                    {submittingOrder ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Mengirim...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Kirim
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-16 py-6 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <span className="font-bold text-slate-800">AURA LAUNDRY</span> &copy; 2026. Tugas Integrasi Sistem.
          </div>
          <div className="text-[11px] text-slate-400">
            Arsitektur Terpisah: Client Portal (<code className="text-slate-600">db_client</code>) &bull; Admin POS (<code className="text-slate-600">db_admin</code>)
          </div>
        </div>
      </footer>
    </div>
  );
}
