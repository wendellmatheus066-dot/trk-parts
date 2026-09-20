import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type ReferenceItem = {
  id: string
  name: string
  reference: string
  measurement: string
  manufacturer: string
  equivalents: string
  originalCode: string
  category: string
  notes: string
  createdAt: string
  updatedAt: string
}

type ReferencePdf = {
  id: string
  referenceId: string
  blob: Blob
  name: string
  size: number
  type: string
}

type CatalogItem = {
  id: string
  name: string
  category: string
  notes: string
  fileName: string
  fileType: string
  size: number
  createdAt: string
  blob?: Blob
}

type Page = 'Início' | 'Consultar' | 'Cadastrar' | 'Catálogos'

const REF_KEY = 'trk_parts_reference_database_v2'
const CATALOG_DB = 'trk_parts_catalogs_db'
const CATALOG_STORE = 'catalogs'
const REF_PHOTO_STORE = 'referencePhotos'
const REF_PDF_STORE = 'referencePdfs'

const emptyReference = {
  name: '',
  reference: '',
  measurement: '',
  manufacturer: '',
  equivalents: '',
  originalCode: '',
  category: '',
  notes: '',
}

const sampleReferences: ReferenceItem[] = []

function uid() {
  return crypto.randomUUID()
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9x.\-\/\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function openPartsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CATALOG_DB, 3)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        db.createObjectStore(CATALOG_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(REF_PHOTO_STORE)) {
        const store = db.createObjectStore(REF_PHOTO_STORE, { keyPath: 'id' })
        store.createIndex('referenceId', 'referenceId', { unique: false })
      }
      if (!db.objectStoreNames.contains(REF_PDF_STORE)) {
        const store = db.createObjectStore(REF_PDF_STORE, { keyPath: 'id' })
        store.createIndex('referenceId', 'referenceId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function openCatalogDb(): Promise<IDBDatabase> {
  return openPartsDb()
}

async function getReferencePhotos(referenceId: string): Promise<{ id: string; referenceId: string; blob: Blob; name: string }[]> {
  const db = await openPartsDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REF_PHOTO_STORE, 'readonly')
    const request = tx.objectStore(REF_PHOTO_STORE).index('referenceId').getAll(referenceId)
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

async function saveReferencePhotos(referenceId: string, photos: Blob[]) {
  const db = await openPartsDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REF_PHOTO_STORE, 'readwrite')
    const store = tx.objectStore(REF_PHOTO_STORE)
    const existing = store.index('referenceId').getAllKeys(referenceId)
    existing.onsuccess = () => {
      existing.result.forEach((key) => store.delete(key))
      photos.slice(0, 4).forEach((blob, index) => {
        store.put({ id: `${referenceId}-${index}`, referenceId, blob, name: blob instanceof File ? blob.name : `foto-${index + 1}` })
      })
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteReferencePhotos(referenceId: string) {
  const db = await openPartsDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REF_PHOTO_STORE, 'readwrite')
    const store = tx.objectStore(REF_PHOTO_STORE)
    const request = store.index('referenceId').getAllKeys(referenceId)
    request.onsuccess = () => request.result.forEach((key) => store.delete(key))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getReferencePdf(referenceId: string): Promise<ReferencePdf | null> {
  const db = await openPartsDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REF_PDF_STORE, 'readonly')
    const request = tx.objectStore(REF_PDF_STORE).index('referenceId').getAll(referenceId)
    request.onsuccess = () => resolve(request.result?.[0] || null)
    request.onerror = () => reject(request.error)
  })
}

async function saveReferencePdf(referenceId: string, file: Blob | null, fileName?: string) {
  const db = await openPartsDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REF_PDF_STORE, 'readwrite')
    const store = tx.objectStore(REF_PDF_STORE)
    const existing = store.index('referenceId').getAllKeys(referenceId)
    existing.onsuccess = () => {
      existing.result.forEach((key) => store.delete(key))
      if (file) {
        store.put({ id: `${referenceId}-pdf`, referenceId, blob: file, name: file instanceof File ? file.name : (fileName || 'arquivo.pdf'), size: file.size, type: file.type || 'application/pdf' })
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteReferencePdf(referenceId: string) {
  await saveReferencePdf(referenceId, null)
}

async function loadPdfJs(): Promise<any> {
  const existing = (window as any).pdfjsLib
  if (existing) return existing
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Não foi possível carregar o leitor de PDF.'))
    document.head.appendChild(script)
  })
  const pdfjsLib = (window as any).pdfjsLib
  if (!pdfjsLib) throw new Error('Leitor de PDF indisponível.')
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  return pdfjsLib
}

function looksLikePartReference(value: string) {
  const ref = value.trim().replace(/[|,;:]+$/g, '')
  if (!ref || ref.length < 4 || ref.length > 32) return false
  if (/^(PCP|HTTP|HTTPS)-/i.test(ref)) return false
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(ref)) return false
  if (!/[A-Z0-9]/i.test(ref) || !/-/.test(ref)) return false
  return /^[A-Z0-9][A-Z0-9 .\/-]*$/i.test(ref)
}

async function extractPdfReferences(file: File): Promise<{ reference: string; name: string }[]> {
  const pdfjsLib = await loadPdfJs()
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const found: { reference: string; name: string }[] = []
  const seen = new Set<string>()

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const items = content.items as any[]
    const rows = new Map<number, string[]>()
    items.forEach((item) => {
      const text = String(item.str || '').trim()
      if (!text) return
      const y = Math.round(Number(item.transform?.[5] || 0) / 2) * 2
      if (!rows.has(y)) rows.set(y, [])
      rows.get(y)!.push(text)
    })
    const lines = Array.from(rows.entries()).sort((a, b) => b[0] - a[0]).map(([, parts]) => parts.join(' ').replace(/\s+/g, ' ').trim())

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      const tokens = line.match(/\b[A-Z0-9]{1,8}-[A-Z0-9]{2,16}(?:-[A-Z0-9]{1,8})?\b/gi) || []
      for (const token of tokens) {
        const reference = token.toUpperCase()
        if (!looksLikePartReference(reference) || seen.has(reference)) continue
        let name = ''
        const sameLine = line.replace(new RegExp(reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').replace(/\s+/g, ' ').trim()
        if (sameLine && !/^(RRP|M|PCP)$/i.test(sameLine)) name = sameLine
        if (!name && lines[i + 1] && !looksLikePartReference(lines[i + 1]) && lines[i + 1].length < 100) name = lines[i + 1]
        if (!name && lines[i - 1] && !looksLikePartReference(lines[i - 1]) && lines[i - 1].length < 100) name = lines[i - 1]
        found.push({ reference, name: name || 'Peça importada do PDF' })
        seen.add(reference)
      }
    }
  }
  return found.slice(0, 200)
}

async function getCatalogs(): Promise<CatalogItem[]> {
  const db = await openCatalogDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CATALOG_STORE, 'readonly')
    const request = tx.objectStore(CATALOG_STORE).getAll()
    request.onsuccess = () => resolve((request.result as CatalogItem[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    request.onerror = () => reject(request.error)
  })
}

async function putCatalog(item: CatalogItem) {
  const db = await openCatalogDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CATALOG_STORE, 'readwrite')
    tx.objectStore(CATALOG_STORE).put(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function removeCatalog(id: string) {
  const db = await openCatalogDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CATALOG_STORE, 'readwrite')
    tx.objectStore(CATALOG_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function ReferenceResultPhoto({ referenceId }: { referenceId: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    getReferencePhotos(referenceId).then((photos) => {
      if (!active || !photos[0]) return
      objectUrl = URL.createObjectURL(photos[0].blob)
      setUrl(objectUrl)
    }).catch(() => {})
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [referenceId])

  if (!url) return null
  return <div className="result-photo"><img src={url} alt="Foto da peça" /></div>
}

function ReferencePdfButton({ referenceId }: { referenceId: string }) {
  const [pdf, setPdf] = useState<ReferencePdf | null>(null)
  useEffect(() => {
    getReferencePdf(referenceId).then(setPdf).catch(() => setPdf(null))
  }, [referenceId])
  if (!pdf) return null
  return (
    <button className="pdf-chip" type="button" onClick={() => {
      const url = URL.createObjectURL(pdf.blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }}>📄 Ver PDF • {pdf.name}</button>
  )
}

function App() {
  const [page, setPage] = useState<Page>('Início')
  const [references, setReferences] = useState<ReferenceItem[]>(() => {
    try {
      const saved = localStorage.getItem(REF_KEY)
      return saved ? JSON.parse(saved) : sampleReferences
    } catch {
      return sampleReferences
    }
  })
  const [query, setQuery] = useState('')
  const [referenceForm, setReferenceForm] = useState(emptyReference)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [referencePhotos, setReferencePhotos] = useState<Blob[]>([])
  const [referencePhotoUrls, setReferencePhotoUrls] = useState<string[]>([])
  const [referencePdf, setReferencePdf] = useState<File | null>(null)
  const [savedReferencePdf, setSavedReferencePdf] = useState<ReferencePdf | null>(null)
  const [pdfImportOpen, setPdfImportOpen] = useState(false)
  const [pdfImportFile, setPdfImportFile] = useState<File | null>(null)
  const [pdfImporting, setPdfImporting] = useState(false)
  const [pdfImportCandidates, setPdfImportCandidates] = useState<{ reference: string; name: string }[]>([])
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([])
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogCategory, setCatalogCategory] = useState('Todos')
  const [catalogFormOpen, setCatalogFormOpen] = useState(false)
  const [catalogName, setCatalogName] = useState('')
  const [catalogCategoryForm, setCatalogCategoryForm] = useState('')
  const [catalogNotes, setCatalogNotes] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)


  useEffect(() => {
    localStorage.setItem(REF_KEY, JSON.stringify(references))
  }, [references])

  useEffect(() => {
    getCatalogs().then(setCatalogs).catch(() => {})
  }, [])

  const filteredReferences = useMemo(() => {
    const words = normalize(query).split(' ').filter(Boolean)
    if (!words.length) return references
    return references.filter((item) => {
      const searchable = normalize([
        item.name,
        item.reference,
        item.measurement,
        item.manufacturer,
        item.equivalents,
        item.originalCode,
        item.category,
        item.notes,
      ].join(' '))
      return words.every((word) => searchable.includes(word))
    })
  }, [references, query])

  const filteredCatalogs = useMemo(() => {
    const q = normalize(catalogQuery)
    return catalogs.filter((item) => {
      const matchesText = !q || normalize(`${item.name} ${item.fileName} ${item.category} ${item.notes}`).includes(q)
      const matchesCategory = catalogCategory === 'Todos' || item.category === catalogCategory
      return matchesText && matchesCategory
    })
  }, [catalogs, catalogQuery, catalogCategory])

  const catalogCategories = useMemo(() => {
    return ['Todos', ...Array.from(new Set(catalogs.map((item) => item.category).filter(Boolean)))]
  }, [catalogs])

  function goToSearch(value = query) {
    setQuery(value)
    setPage('Consultar')
  }

  function clearPhotoUrls() {
    referencePhotoUrls.forEach((url) => URL.revokeObjectURL(url))
    setReferencePhotoUrls([])
  }

  function resetReferenceForm() {
    setReferenceForm(emptyReference)
    setEditingId(null)
    setReferencePhotos([])
    setReferencePdf(null)
    setSavedReferencePdf(null)
    clearPhotoUrls()
  }

  function addReferencePhotos(files: FileList | null) {
    if (!files) return
    const incoming = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (!incoming.length) return
    const combined = [...referencePhotos, ...incoming].slice(0, 4)
    clearPhotoUrls()
    setReferencePhotos(combined)
    setReferencePhotoUrls(combined.map((blob) => URL.createObjectURL(blob)))
  }

  function removeReferencePhoto(index: number) {
    const next = referencePhotos.filter((_, i) => i !== index)
    clearPhotoUrls()
    setReferencePhotos(next)
    setReferencePhotoUrls(next.map((blob) => URL.createObjectURL(blob)))
  }

  async function saveReference(event: React.FormEvent) {
    event.preventDefault()

    if (!referenceForm.name.trim() || !referenceForm.reference.trim()) {
      alert('Informe pelo menos o nome da peça e a referência.')
      return
    }

    const now = new Date().toISOString()
    const id = editingId || uid()
    const saved: ReferenceItem = {
      id,
      name: referenceForm.name.trim(),
      reference: referenceForm.reference.trim(),
      measurement: referenceForm.measurement.trim(),
      manufacturer: referenceForm.manufacturer.trim(),
      equivalents: referenceForm.equivalents.trim(),
      originalCode: referenceForm.originalCode.trim(),
      category: referenceForm.category.trim(),
      notes: referenceForm.notes.trim(),
      createdAt: editingId ? (references.find((item) => item.id === editingId)?.createdAt || now) : now,
      updatedAt: now,
    }

    setReferences((current) =>
      editingId
        ? current.map((item) => item.id === editingId ? saved : item)
        : [saved, ...current]
    )

    try {
      await saveReferencePhotos(id, referencePhotos)
      await saveReferencePdf(
        id,
        referencePdf || savedReferencePdf?.blob || null,
        referencePdf?.name || savedReferencePdf?.name
      )
    } catch {
      alert('A referência foi salva, mas houve um problema ao guardar as fotos/PDF neste navegador.')
    }

    resetReferenceForm()
    setPage('Consultar')
  }

  async function editReference(item: ReferenceItem) {
    setReferenceForm({
      name: item.name,
      reference: item.reference,
      measurement: item.measurement,
      manufacturer: item.manufacturer,
      equivalents: item.equivalents,
      originalCode: item.originalCode,
      category: item.category,
      notes: item.notes,
    })
    setEditingId(item.id)
    try {
      const savedPhotos = await getReferencePhotos(item.id)
      const savedPdf = await getReferencePdf(item.id)
      clearPhotoUrls()
      const blobs = savedPhotos.map((photo) => photo.blob)
      setReferencePhotos(blobs)
      setReferencePhotoUrls(blobs.map((blob) => URL.createObjectURL(blob)))
      setSavedReferencePdf(savedPdf)
      setReferencePdf(null)
    } catch {
      setReferencePhotos([])
      clearPhotoUrls()
    }
    setPage('Cadastrar')
  }

  async function deleteReference(id: string) {
    if (!confirm('Excluir esta referência?')) return

    setReferences((current) => current.filter((item) => item.id !== id))
    await deleteReferencePhotos(id).catch(() => {})
    await deleteReferencePdf(id).catch(() => {})
  }

  async function handlePdfImport() {
    if (!pdfImportFile) return
    setPdfImporting(true)
    try {
      const candidates = await extractPdfReferences(pdfImportFile)
      setPdfImportCandidates(candidates)
      if (!candidates.length) alert('Não encontrei referências com formato reconhecível neste PDF. O catálogo ainda pode ser guardado normalmente.')
    } catch (error) {
      console.error(error)
      alert('Não consegui ler o PDF. Você ainda pode anexá-lo ao acervo ou a uma peça.')
    } finally {
      setPdfImporting(false)
    }
  }

  function importCandidates() {
    if (!pdfImportCandidates.length) return
    const now = new Date().toISOString()
    const additions: ReferenceItem[] = pdfImportCandidates.map((candidate) => ({
      id: uid(),
      name: candidate.name,
      reference: candidate.reference,
      measurement: '',
      manufacturer: '',
      equivalents: '',
      originalCode: '',
      category: 'Importado de PDF',
      notes: `Importado do arquivo ${pdfImportFile?.name || 'PDF'}. Confira os dados antes de usar.`,
      createdAt: now,
      updatedAt: now,
    }))
    setReferences((current) => {
      const existing = new Set(current.map((item) => normalize(item.reference)))
      return [...additions.filter((item) => !existing.has(normalize(item.reference))), ...current]
    })
    setPdfImportOpen(false)
    setPdfImportFile(null)
    setPdfImportCandidates([])
    alert(`${additions.length} referência(s) importada(s). Confira os dados no banco.`)
  }

async function saveCatalog(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedFile || !catalogName.trim()) {
      alert('Informe o nome e selecione um arquivo.')
      return
    }

    const allowed = selectedFile.type === 'application/pdf' || selectedFile.type.startsWith('image/')
    if (!allowed) {
      alert('Use PDF, JPG, PNG ou WEBP.')
      return
    }

    const item: CatalogItem = {
      id: uid(),
      name: catalogName.trim(),
      category: catalogCategoryForm.trim() || 'Geral',
      notes: catalogNotes.trim(),
      fileName: selectedFile.name,
      fileType: selectedFile.type,
      size: selectedFile.size,
      createdAt: new Date().toISOString(),
      blob: selectedFile,
    }

    try {
      await putCatalog(item)
      setCatalogs(await getCatalogs())
      setCatalogName('')
      setCatalogCategoryForm('')
      setCatalogNotes('')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setCatalogFormOpen(false)
    } catch {
      alert('Não foi possível guardar o catálogo neste navegador.')
    }
  }

  async function openCatalog(item: CatalogItem) {
    if (!item.blob) return
    const url = URL.createObjectURL(item.blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  async function downloadCatalog(item: CatalogItem) {
    if (!item.blob) return
    const url = URL.createObjectURL(item.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = item.fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function deleteCatalog(id: string) {
    if (!confirm('Excluir este catálogo do acervo local?')) return
    await removeCatalog(id)
    setCatalogs(await getCatalogs())
  }

  function renderHeader(title: string, description: string) {
    return (
      <div className="page-header">
        <div>
          <div className="eyebrow">TRK PARTS</div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
    )
  }


  function renderHome() {
    return (
      <section className="content">
        <div className="hero">
          <div className="eyebrow">BANCO TÉCNICO PESSOAL</div>
          <h2>Encontre uma peça em segundos.</h2>
          <p></p>
          <div className="hero-search">
            <span>⌕</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') goToSearch()
              }}
              placeholder="Ex.: rolamento de centro, 1R-1808, 50 x 90 x 23"
            />
            <button onClick={() => goToSearch()}>Pesquisar</button>
          </div>
          <div className="search-hints">
            <span>Nome</span><span>Referência</span><span>Medida</span><span>Fabricante</span><span>Equivalente</span>
          </div>
        </div>

        <div className="stats-grid">
          <button className="stat" onClick={() => setPage('Consultar')}>
            <strong>{references.length}</strong><span>REFERÊNCIAS</span><small>Consultar banco →</small>
          </button>
          <button className="stat" onClick={() => setPage('Cadastrar')}>
            <strong>+</strong><span>NOVA REFERÊNCIA</span><small>Cadastrar peça →</small>
          </button>
          <button className="stat" onClick={() => setPage('Catálogos')}>
            <strong>{catalogs.length}</strong><span>CATÁLOGOS</span><small>Abrir meu acervo →</small>
          </button>
        </div>

        <div className="home-grid">
          <section className="panel">
            <div className="panel-head">
              <div><h3>Consultas recentes</h3><p>As últimas referências cadastradas.</p></div>
              <button className="text-button" onClick={() => setPage('Consultar')}>Ver banco →</button>
            </div>
            {references.length === 0 ? (
              <div className="empty"><strong>Seu banco ainda está vazio.</strong><span></span><button onClick={() => setPage('Cadastrar')}>CADASTRAR PRIMEIRA</button></div>
            ) : (
              <div className="mini-list">
                {references.slice(0, 6).map((item) => (
                  <button key={item.id} className="mini-row" onClick={() => goToSearch(item.reference)}>
                    <div><strong>{item.name}</strong><span>{item.manufacturer || 'Fabricante não informado'} {item.category ? `• ${item.category}` : ''}</span></div>
                    <b>{item.reference}</b>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head"><div><h3>Meu acervo</h3><p>Catálogos guardados neste navegador.</p></div><button className="text-button" onClick={() => setPage('Catálogos')}>Abrir →</button></div>
            {catalogs.length === 0 ? (
              <div className="empty compact"><strong>Nenhum catálogo ainda.</strong><span>Guarde seus PDFs e imagens técnicos aqui.</span></div>
            ) : (
              <div className="catalog-mini-list">
                {catalogs.slice(0, 5).map((item) => <button key={item.id} onClick={() => openCatalog(item)}><strong>{item.name}</strong><span>{item.category} • {formatBytes(item.size)}</span></button>)}
              </div>
            )}
          </section>
        </div>
      </section>
    )
  }

  function renderConsult() {
    return (
      <section className="content">
        {renderHeader('Consultar referências', '')}
        <div className="big-search">
          <span>⌕</span>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: rolamento de centro 50 x 90 x 23" />
          {query && <button onClick={() => setQuery('')}>Limpar</button>}
        </div>
        <div className="result-bar"><strong>{filteredReferences.length}</strong> resultado(s) encontrado(s)</div>

        {filteredReferences.length === 0 ? (
          <div className="empty large"><strong>Nenhuma referência encontrada.</strong><span>Tente outra palavra, parte da referência ou a medida.</span><button onClick={() => setPage('Cadastrar')}>CADASTRAR ESTA PEÇA</button></div>
        ) : (
          <div className="reference-grid">
            {filteredReferences.map((item) => (
              <article className="reference-result" key={item.id}>
                <ReferenceResultPhoto referenceId={item.id} />
                <div className="result-top"><span>{item.category || 'PEÇA'}</span><b>{item.reference}</b></div>
                <h3>{item.name}</h3>
                <div className="result-fields">
                  <div><small>MEDIDA</small><strong>{item.measurement || 'Não informada'}</strong></div>
                  <div><small>FABRICANTE</small><strong>{item.manufacturer || 'Não informado'}</strong></div>
                  <div><small>CÓDIGO ORIGINAL</small><strong>{item.originalCode || '—'}</strong></div>
                  <div><small>EQUIVALENTES</small><strong>{item.equivalents || '—'}</strong></div>
                </div>
                {item.notes && <div className="notes"><small>OBSERVAÇÃO</small><p>{item.notes}</p></div>}
                <ReferencePdfButton referenceId={item.id} />
                <div className="result-actions"><button onClick={() => editReference(item)}>Editar</button><button className="danger" onClick={() => deleteReference(item.id)}>Excluir</button></div>
              </article>
            ))}
          </div>
        )}
      </section>
    )
  }

  function renderRegister() {
    return (
      <section className="content narrow-content">
        {renderHeader(editingId ? 'Editar referência' : 'Cadastrar referência', '')}
        <form className="form-card" onSubmit={saveReference}>
          <div className="form-grid">
            <label>Nome da peça *<input value={referenceForm.name} onChange={(e) => setReferenceForm({ ...referenceForm, name: e.target.value })} placeholder="Ex.: Rolamento de centro" /></label>
            <label>Referência *<input value={referenceForm.reference} onChange={(e) => setReferenceForm({ ...referenceForm, reference: e.target.value })} placeholder="Ex.: SKF 32210" /></label>
            <label>Medida<input value={referenceForm.measurement} onChange={(e) => setReferenceForm({ ...referenceForm, measurement: e.target.value })} placeholder="Ex.: 50 x 90 x 23 mm" /></label>
            <label>Fabricante<input value={referenceForm.manufacturer} onChange={(e) => setReferenceForm({ ...referenceForm, manufacturer: e.target.value })} placeholder="Ex.: SKF" /></label>
            <label>Referências equivalentes<input value={referenceForm.equivalents} onChange={(e) => setReferenceForm({ ...referenceForm, equivalents: e.target.value })} placeholder="Ex.: FAG 32210 • TIMKEN ..." /></label>
            <label>Código original<input value={referenceForm.originalCode} onChange={(e) => setReferenceForm({ ...referenceForm, originalCode: e.target.value })} placeholder="Código original da máquina/peça" /></label>
            <label>Categoria<input value={referenceForm.category} onChange={(e) => setReferenceForm({ ...referenceForm, category: e.target.value })} placeholder="Ex.: Rolamento, Filtro, Correia" /></label>
            <label className="full">Observações<textarea value={referenceForm.notes} onChange={(e) => setReferenceForm({ ...referenceForm, notes: e.target.value })} placeholder="Informações úteis, aplicação, fornecedor, medidas adicionais..." /></label>
          </div>
          <div className="photo-section">
            <div className="photo-section-head"><div><strong>Fotos da peça</strong><span>Até 4 fotos. Frente, lateral, embalagem ou referência gravada.</span></div><label className="photo-add">+ Adicionar fotos<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(e) => addReferencePhotos(e.target.files)} /></label></div>
            {referencePhotoUrls.length > 0 ? (
              <div className="photo-grid">
                {referencePhotoUrls.map((url, index) => <div className="photo-item" key={`${url}-${index}`}><img src={url} alt={`Foto ${index + 1} da peça`} /><button type="button" onClick={() => removeReferencePhoto(index)}>×</button></div>)}
              </div>
            ) : <div className="photo-empty">Nenhuma foto adicionada.</div>}
          </div>
          <div className="pdf-attach-section">
            <div><strong>📄 PDF da peça / catálogo</strong><span>Você pode guardar o PDF específico junto desta referência.</span></div>
            <label className="pdf-upload">{referencePdf?.name || savedReferencePdf?.name || 'Selecionar PDF'}<input type="file" accept="application/pdf" onChange={(e) => { setReferencePdf(e.target.files?.[0] || null); setSavedReferencePdf(null) }} /></label>
            {(referencePdf || savedReferencePdf) && <div className="selected-file">{referencePdf?.name || savedReferencePdf?.name} • {formatBytes(referencePdf?.size || savedReferencePdf?.size || 0)} {referencePdf ? '• será salvo ao clicar em salvar' : '• já anexado'}</div>}
          </div>
          <div className="form-actions"><button type="button" className="secondary" onClick={() => { resetReferenceForm(); setPage('Consultar') }}>Cancelar</button><button type="submit" className="primary">{editingId ? 'Salvar alterações' : 'Salvar referência'}</button></div>
        </form>
      </section>
    )
  }

  function renderCatalogs() {
    return (
      <section className="content">
        {renderHeader('Meus catálogos', '')}
        <div className="catalog-toolbar">
          <div className="big-search small"><span>⌕</span><input value={catalogQuery} onChange={(e) => setCatalogQuery(e.target.value)} placeholder="Pesquisar catálogo..." /></div>
          <select value={catalogCategory} onChange={(e) => setCatalogCategory(e.target.value)}>{catalogCategories.map((category) => <option key={category}>{category}</option>)}</select>
          <button className="secondary" onClick={() => setPdfImportOpen((value) => !value)}>⇩ Importar referências do PDF</button><button className="primary" onClick={() => setCatalogFormOpen((value) => !value)}>+ Adicionar catálogo</button>
        </div>

        {pdfImportOpen && (
          <div className="form-card catalog-form import-card">
            <div className="form-grid">
              <label className="full">PDF para leitura<input type="file" accept="application/pdf" onChange={(e) => { setPdfImportFile(e.target.files?.[0] || null); setPdfImportCandidates([]) }} /></label>
            </div>
            {pdfImportFile && <div className="selected-file">{pdfImportFile.name} • {formatBytes(pdfImportFile.size)}</div>}
            <div className="form-actions"><button type="button" className="secondary" onClick={() => { setPdfImportOpen(false); setPdfImportFile(null); setPdfImportCandidates([]) }}>Cancelar</button><button type="button" className="primary" disabled={!pdfImportFile || pdfImporting} onClick={handlePdfImport}>{pdfImporting ? 'Lendo PDF...' : 'Ler PDF'}</button></div>
            {pdfImportCandidates.length > 0 && (
              <div className="import-results"><strong>{pdfImportCandidates.length} referências encontradas</strong><div className="import-list">{pdfImportCandidates.slice(0, 30).map((item, index) => <div key={`${item.reference}-${index}`}><b>{item.reference}</b><span>{item.name}</span></div>)}</div><button type="button" className="primary" onClick={importCandidates}>Importar para o banco</button><small>As referências entram como rascunho para você conferir e completar medida/fabricante.</small></div>
            )}
          </div>
        )}

        {catalogFormOpen && (
          <form className="form-card catalog-form" onSubmit={saveCatalog}>
            <div className="form-grid">
              <label>Nome do catálogo *<input value={catalogName} onChange={(e) => setCatalogName(e.target.value)} placeholder="Ex.: Catálogo de rolamentos SKF" /></label>
              <label>Categoria<input value={catalogCategoryForm} onChange={(e) => setCatalogCategoryForm(e.target.value)} placeholder="Ex.: Rolamentos, Caterpillar, Filtros" /></label>
              <label className="full">Arquivo *<input ref={fileInputRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} /></label>
              <label className="full">Observações<textarea value={catalogNotes} onChange={(e) => setCatalogNotes(e.target.value)} placeholder="Ex.: catálogo usado para conferência de medidas." /></label>
            </div>
            {selectedFile && <div className="selected-file">{selectedFile.name} • {formatBytes(selectedFile.size)}</div>}
            <div className="form-actions"><button type="button" className="secondary" onClick={() => setCatalogFormOpen(false)}>Cancelar</button><button className="primary" type="submit">Guardar catálogo</button></div>
          </form>
        )}

        {filteredCatalogs.length === 0 ? (
          <div className="empty large"><strong>Nenhum catálogo encontrado.</strong><span></span><button onClick={() => setCatalogFormOpen(true)}>ADICIONAR CATÁLOGO</button></div>
        ) : (
          <div className="catalog-grid">
            {filteredCatalogs.map((item) => (
              <article className="catalog-card" key={item.id}>
                <div className="file-badge">{item.fileType === 'application/pdf' ? 'PDF' : 'IMG'}</div>
                <div className="catalog-info"><span>{item.category}</span><h3>{item.name}</h3><p>{item.fileName}</p><small>{formatBytes(item.size)} • {new Date(item.createdAt).toLocaleDateString('pt-BR')}</small></div>
                {item.notes && <div className="catalog-notes">{item.notes}</div>}
                <div className="catalog-actions"><button onClick={() => openCatalog(item)}>Abrir</button><button onClick={() => downloadCatalog(item)}>Baixar</button><button className="danger" onClick={() => deleteCatalog(item.id)}>Excluir</button></div>
              </article>
            ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><img className="brand-logo" src="/trk-parts-logo.png" alt="TRK PARTS" /><small>REFERÊNCIAS • MEDIDAS • CATÁLOGOS</small></div>
        <nav>
          {(['Início', 'Consultar', 'Cadastrar', 'Catálogos'] as Page[]).map((item) => (
            <button key={item} className={page === item ? 'active' : ''} onClick={() => { setPage(item); if (item === 'Cadastrar' && !editingId) resetReferenceForm() }}>{item}</button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <strong>{references.length}</strong><span>referências salvas</span>
          <strong>{catalogs.length}</strong><span>catálogos salvos</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="top-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') goToSearch() }} placeholder="Pesquisar peça, referência ou medida..." /><kbd>/</kbd></div>
          <button className="top-catalog" onClick={() => setPage('Catálogos')}>Meus catálogos</button>
        </header>

        {page === 'Início' && renderHome()}
        {page === 'Consultar' && renderConsult()}
        {page === 'Cadastrar' && renderRegister()}
        {page === 'Catálogos' && renderCatalogs()}

        <footer>TRK PARTS • Banco pessoal de referências e catálogos</footer>
      </main>
    </div>
  )
}

export default App
