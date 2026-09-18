import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import QRCode from 'qrcode'
import QrScanner from 'qr-scanner'
import { Check, Download, FileImage, ImagePlus, MessageCircle, Share2, Upload, X } from 'lucide-react'
import './App.css'

const formatAmount = (digits: string) => digits ? `Rp ${Number(digits).toLocaleString('id-ID')}` : ''

const crc16 = (value: string) => {
  let crc = 0xffff
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

const updateAmount = (payload: string, amount: string) => {
  const body = payload.replace(/63\d{2}[0-9A-Fa-f]{4}$/, '')
  const fields: string[] = []
  let index = 0
  while (index < body.length) {
    const tag = body.slice(index, index + 2)
    const length = Number(body.slice(index + 2, index + 4))
    const end = index + 4 + length
    if (!tag || Number.isNaN(length) || end > body.length) return null
    fields.push(body.slice(index, end))
    index = end
  }
  const amountField = `54${amount.length.toString().padStart(2, '0')}${amount}`
  const nextFields = fields.filter((field) => field.slice(0, 2) !== '54')
  const crcInput = `${[...nextFields, amountField].join('')}6304`
  return `${crcInput}${crc16(crcInput)}`
}

const normalizePayload = (value: string) => value.trim().replace(/[\r\n\t]/g, '')

const isQrisPayload = (value: string) => {
  if (!value.startsWith('000201') || !value.includes('6304')) return false
  return updateAmount(value, '1') !== null
}

function App() {
  const [payload, setPayload] = useState('')
  const [amountDigits, setAmountDigits] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const amountLabel = formatAmount(amountDigits)
  const hasValidAmount = Number(amountDigits) > 0

  useEffect(() => {
    if (!payload || !hasValidAmount) { setQrDataUrl(''); return }
    const updatedPayload = updateAmount(payload, amountDigits)
    if (!updatedPayload) { setQrDataUrl(''); return }
    QRCode.toDataURL(updatedPayload, { width: 720, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#172033', light: '#ffffff' } })
      .then(setQrDataUrl).catch(() => setQrDataUrl(''))
  }, [amountDigits, hasValidAmount, payload])

  const readQrFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please choose a PNG or JPG image.'); return }
    try {
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
      const decodedPayload = normalizePayload(result.data)
      if (!isQrisPayload(decodedPayload)) {
        setPayload('')
        setFileName('')
        setError(decodedPayload.startsWith('http') ? 'QR terbaca, tetapi ini bukan QRIS statis. Gunakan QRIS merchant dari DANA.' : 'QR terbaca, tetapi formatnya bukan QRIS yang bisa diubah nominalnya.')
        return
      }
      setPayload(decodedPayload); setFileName(file.name); setError('')
    } catch { setPayload(''); setFileName(''); setError('Gambar QR belum terbaca. Coba gunakan gambar yang lebih jelas dan tidak terpotong.') }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void readQrFile(file)
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (file) void readQrFile(file)
  }

  const handleDownload = () => {
    if (!qrDataUrl) return
    const link = document.createElement('a')
    link.href = qrDataUrl; link.download = `qrisflow-${amountDigits}.png`; link.click()
  }

  const handleWhatsAppShare = () => {
    if (!payload || !amountLabel) return
    const message = `QR pembayaran\nNominal: ${amountLabel}\n\n${payload}`
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  const handleMoreShare = async () => {
    if (!qrDataUrl || !navigator.share) return
    const response = await fetch(qrDataUrl)
    const blob = await response.blob()
    const file = new File([blob], `qrisflow-${amountDigits}.png`, { type: 'image/png' })
    const shareData = { title: 'QRIS Payment', text: `QR pembayaran ${amountLabel}`, files: [file] }
    if (navigator.canShare?.({ files: [file] })) await navigator.share(shareData)
    else await navigator.share({ title: shareData.title, text: shareData.text })
  }

  return (
    <main className="app-shell">
      <header className="site-header">
        <div className="brand-mark" aria-hidden="true"><span /></div>
        <div><h1>QrisFlow</h1><p>Create. Set. Pay.</p></div>
      </header>
      <section className="workspace" aria-label="QRIS generator">
        <div className="settings-panel">
          <div className="section-heading"><span className="eyebrow">01 / SETUP</span><h2>Create QRIS</h2></div>
          <div className="field-group">
            <label className="field-label" htmlFor="qris-file">Upload QRIS</label>
            <div className={`upload-zone ${payload ? 'is-loaded' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
              {payload ? <div className="loaded-state"><div className="status-icon"><Check size={19} strokeWidth={2.5} /></div><div><strong>QRIS loaded</strong><span>{fileName}</span></div><button type="button" className="clear-button" aria-label="Remove QRIS" onClick={() => { setPayload(''); setFileName('') }}><X size={17} /></button></div> : <><div className="upload-icon"><ImagePlus size={22} /></div><strong>Upload your QRIS</strong><span>PNG, JPG, or QR image</span><button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Choose Image</button></>}
            </div>
            <input ref={fileInputRef} id="qris-file" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} />
            {error && <p className="error-message">{error}</p>}
          </div>
          <div className="amount-divider" />
          <div className="field-group amount-group">
            <label className="field-label" htmlFor="amount">Payment Amount</label>
            <div className="amount-input-wrap"><input id="amount" inputMode="numeric" value={amountLabel} onChange={(event) => setAmountDigits(event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Rp 25.000" /></div>
            <p className="field-note">Enter the amount your customer should pay.</p>
          </div>
        </div>
        <div className="preview-panel">
          <div className="preview-heading"><div><span className="eyebrow">02 / READY</span><h2>Preview</h2></div>{qrDataUrl && <span className="live-pill"><span /> Live</span>}</div>
          <div className={`qr-stage ${qrDataUrl ? 'has-qr' : ''}`}>{qrDataUrl ? <img src={qrDataUrl} alt="Generated payment QR code" /> : <div className="empty-preview"><div className="empty-icon"><FileImage size={24} /></div><span>Your QR will appear here</span></div>}</div>
          <div className="preview-footer"><div className="preview-amount-label">Payment amount</div><div className={`preview-amount ${amountLabel ? '' : 'muted'}`}>{amountLabel || 'Rp 25.000'}</div><button type="button" className="download-button" disabled={!qrDataUrl} onClick={handleDownload}><Download size={18} /> Download QR</button><div className="share-actions"><button type="button" className="share-button whatsapp-button" disabled={!qrDataUrl} onClick={handleWhatsAppShare}><MessageCircle size={16} /> WhatsApp</button><button type="button" className="share-button" disabled={!qrDataUrl || !navigator.share} onClick={() => void handleMoreShare}><Share2 size={16} /> Bagikan lainnya</button></div></div>
        </div>
      </section>
      <footer className="page-footer"><span>Private by design</span><span className="footer-dot" /><span>Processed in your browser</span></footer>
    </main>
  )
}

export default App
