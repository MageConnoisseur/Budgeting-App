import { apiFetch, apiUpload } from './client'
import type { ImportCandidate, ImportCommit, ImportInbox, ImportPreview } from '../types/api'

export function previewImport(file: File) {
  const form = new FormData()
  form.append('file', file)
  return apiUpload<ImportPreview>('/imports/preview', form)
}

export function commitImport(file: File, dateFrom: string, dateTo: string) {
  const form = new FormData()
  form.append('file', file)
  form.append('date_from', dateFrom)
  form.append('date_to', dateTo)
  return apiUpload<ImportCommit>('/imports', form)
}

export function listImportInbox() {
  return apiFetch<ImportInbox>('/imports/inbox')
}

export function acceptImport(id: string, categoryId: string) {
  return apiFetch<ImportCandidate>(`/imports/candidates/${id}/accept`, {
    method: 'POST',
    body: JSON.stringify({ category_id: categoryId }),
  })
}

export function skipImport(id: string) {
  return apiFetch<ImportCandidate>(`/imports/candidates/${id}/skip`, {
    method: 'POST',
  })
}

export function mergeImport(id: string, transactionId?: string) {
  return apiFetch<ImportCandidate>(`/imports/candidates/${id}/merge`, {
    method: 'POST',
    body: JSON.stringify(
      transactionId ? { transaction_id: transactionId } : {},
    ),
  })
}
