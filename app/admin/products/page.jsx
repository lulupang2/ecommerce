'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Save, UploadCloud } from 'lucide-react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { $getRoot, FORMAT_TEXT_COMMAND } from 'lexical';
import { HeadingNode } from '@lexical/rich-text';
import { ListItemNode, ListNode, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { Button } from '@/components/ui/button';
import { authHeaders, readSession } from '@/lib/session';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
const editorConfig = { namespace: 'TECHZONEProductEditor', theme: { paragraph: 'mb-2' }, onError: error => { throw error; }, nodes: [HeadingNode, ListNode, ListItemNode] };

export default function ProductEditorPage() {
  const [session, setSession] = useState(null);
  const [product, setProduct] = useState({ name: '', brand: '', category: '노트북', sku: '', modelNumber: '', barcode: '', listPrice: '', price: '', costPrice: '', weightGram: '', stock: '', color: '', image: '', note: '', status: 'draft' });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);
  const productId = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('id');

  useEffect(() => {
    const current = readSession();
    setSession(current);
    if (productId) fetch(`${API}/products/${encodeURIComponent(productId)}`).then(response => response.json()).then(data => { const variant = data.variants?.[0] || {}; setProduct({ ...data, sku: variant.sku || '', modelNumber: variant.modelNumber || '', barcode: variant.barcode || '', listPrice: variant.listPrice || data.price, costPrice: variant.costPrice || '', weightGram: variant.weightGram || '' }); setPreview(data.image || ''); }).catch(() => setMessage('상품 정보를 불러오지 못했습니다.'));
  }, [productId]);

  function chooseFile(files) {
    const next = files?.[0];
    if (!next) return;
    if (!next.type.startsWith('image/')) return setMessage('이미지 파일만 업로드할 수 있습니다.');
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  async function uploadImage() {
    if (!file) return product.image;
    const response = await fetch(`${API}/media/upload-url`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', ...authHeaders({ mutation: true }) }, body: JSON.stringify({ fileName: file.name, contentType: file.type }) });
    const metadata = await response.json();
    if (!response.ok) throw new Error(metadata.code || 'MEDIA_UPLOAD_FAILED');
    const upload = await fetch(metadata.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
    if (!upload.ok) throw new Error('이미지 업로드에 실패했습니다.');
    return metadata.publicUrl;
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const image = await uploadImage();
      const response = await fetch(`${API}/products${productId ? `/${productId}` : ''}`, { method: productId ? 'PATCH' : 'POST', credentials: 'include', headers: { 'content-type': 'application/json', ...authHeaders({ mutation: true }) }, body: JSON.stringify({ ...product, image, price: Number(product.price), listPrice: Number(product.listPrice || product.price), costPrice: Number(product.costPrice || 0), weightGram: Number(product.weightGram || 0), stock: Number(product.stock) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code || 'PRODUCT_SAVE_FAILED');
      setMessage(productId ? '상품을 수정했습니다.' : '상품을 등록했습니다.');
      if (!productId && data.id) window.history.replaceState({}, '', `/admin/products/?id=${data.id}`);
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  }

  if (!session || (session.user?.role !== 'admin' && !session.user?.permissions?.includes('products.update'))) return <main className="grid min-h-screen place-items-center bg-slate-100"><div className="rounded-3xl bg-white p-10 text-center"><h1 className="text-2xl font-black">상품 편집 권한이 필요합니다.</h1><a href="/login/" className="mt-6 inline-block rounded-xl bg-slate-950 px-5 py-3 text-white">로그인</a></div></main>;

  const basicFields = [['상품명', 'name', 'text'], ['브랜드', 'brand', 'text'], ['카테고리', 'category', 'text'], ['색상·옵션', 'color', 'text']];
  const variantFields = [['SKU', 'sku', 'text'], ['모델번호', 'modelNumber', 'text'], ['바코드', 'barcode', 'text'], ['정가', 'listPrice', 'number'], ['판매가', 'price', 'number'], ['원가', 'costPrice', 'number'], ['중량(g)', 'weightGram', 'number'], ['초기 재고', 'stock', 'number']];
  const field = ([label, key, type]) => <label className="grid gap-2 text-xs font-bold" key={key}>{label}<input required={['name', 'brand', 'category', 'sku', 'modelNumber', 'price', 'stock'].includes(key)} type={type} min={type === 'number' ? 0 : undefined} value={product[key] ?? ''} onChange={event => setProduct(current => ({ ...current, [key]: event.target.value }))} className="rounded-xl border p-3 text-sm font-normal" /></label>;
  return <main className="p-4 md:p-7 xl:p-9"><div className="mx-auto max-w-5xl"><div className="flex items-center justify-between"><a href="/admin/products/manage/" className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16}/> 상품 목록</a><span className="text-xs text-slate-400">Lexical WYSIWYG</span></div><header className="py-10"><p className="text-[10px] font-bold tracking-[.24em] text-indigo-600">PRODUCT CONTENT STUDIO</p><h1 className="mt-3 text-4xl font-black tracking-[-.06em]">{productId ? '상품 수정' : '상품 등록'}</h1></header><form onSubmit={submit} className="grid gap-6"><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">기본 정보</h2><div className="mt-5 grid gap-4 md:grid-cols-2">{basicFields.map(field)}</div><label className="mt-4 grid gap-2 text-xs font-bold">판매 상태<select value={product.status || 'draft'} onChange={event => setProduct(current => ({ ...current, status: event.target.value }))} className="rounded-xl border p-3 text-sm font-normal"><option value="draft">작성 중</option><option value="published">판매 중</option><option value="hidden">숨김</option><option value="archived">보관</option></select></label></section><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">SKU·가격·물류 정보</h2><div className="mt-5 grid gap-4 md:grid-cols-2">{variantFields.map(field)}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">썸네일 이미지</h2><div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); chooseFile(event.dataTransfer.files); }} onClick={() => fileRef.current?.click()} className="mt-5 grid min-h-64 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">{preview ? <img src={preview} alt="썸네일 미리보기" className="h-64 w-full object-contain" /> : <div className="text-center"><UploadCloud className="mx-auto text-indigo-600"/><p className="mt-3 font-bold">이미지를 드래그하거나 클릭하세요</p><p className="mt-2 text-xs text-slate-400">JPG, PNG, WEBP</p></div>}<input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={event => chooseFile(event.target.files)} /></div></section><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-xl font-black">상세 설명</h2><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => editor?.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}>굵게</Button><Button type="button" size="sm" variant="outline" onClick={() => editor?.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}>목록</Button></div></div><LexicalComposer initialConfig={editorConfig}><EditorBridge value={product.note} onEditor={setEditor} onHtml={html => setProduct(current => ({ ...current, note: html }))} /></LexicalComposer></section><div className="flex items-center justify-between"><p role="status" className="text-sm text-indigo-600">{message}</p><Button disabled={saving} type="submit">{saving ? <Loader2 className="mr-2 animate-spin" size={16}/> : <Save className="mr-2" size={16}/>}저장</Button></div></form></div></main>;
}

function EditorBridge({ value, onEditor, onHtml }) { return <><CaptureEditor value={value} onEditor={onEditor}/><div className="mt-4 min-h-64 rounded-2xl border p-4"><RichTextPlugin contentEditable={<ContentEditable className="min-h-56 outline-none" />} placeholder={<p className="text-sm text-slate-400">상품 상세 설명을 입력하세요.</p>} ErrorBoundary={LexicalErrorBoundary}/><HistoryPlugin/><OnChangePlugin onChange={(state, currentEditor) => state.read(() => onHtml($generateHtmlFromNodes(currentEditor)))} /></div></>; }
function CaptureEditor({ value, onEditor }) { const [editor] = useLexicalComposerContext(); useEffect(() => { onEditor(editor); if (value) editor.update(() => { const dom = new DOMParser().parseFromString(value, 'text/html'); $getRoot().clear(); $getRoot().append(...$generateNodesFromDOM(editor, dom)); }); }, [editor]); return null; }
