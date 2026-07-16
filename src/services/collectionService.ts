import {
  addSnippetCollectionItem,
  createSnippetFolder,
  deleteSnippetCollectionItem,
  deleteSnippetFolder,
  moveSnippetCollectionItem,
  updateSnippetCollectionItem,
  updateSnippetFolder
} from "~/src/sdk/storage"
import type {
  CollectionFolderMutationResult,
  CollectionItemMutationResult,
  CreateCollectionFolderPayload,
  CreateCollectionItemPayload,
  DeleteCollectionFolderPayload,
  DeleteCollectionItemPayload,
  MoveCollectionItemPayload,
  UpdateCollectionFolderPayload,
  UpdateCollectionItemPayload
} from "~/src/sdk/types"

export async function createCollectionFolder(
  payload: CreateCollectionFolderPayload
): Promise<CollectionFolderMutationResult> {
  const collections = await createSnippetFolder(
    payload.name,
    payload.description
  )
  const folder = collections.folders.find(
    (item) => item.name === payload.name.trim()
  )
  return { collections, folderId: folder?.id ?? "" }
}

export async function updateCollectionFolder(
  payload: UpdateCollectionFolderPayload
): Promise<CollectionFolderMutationResult> {
  const collections = await updateSnippetFolder(payload.folderId, {
    name: payload.name,
    description: payload.description
  })
  return { collections, folderId: payload.folderId }
}

export async function deleteCollectionFolder(
  payload: DeleteCollectionFolderPayload
): Promise<CollectionFolderMutationResult> {
  const collections = await deleteSnippetFolder(payload.folderId)
  return { collections, folderId: payload.folderId }
}

export async function updateCollectionItem(
  payload: UpdateCollectionItemPayload
): Promise<CollectionItemMutationResult> {
  const collections = await updateSnippetCollectionItem(payload.itemId, {
    title: payload.title,
    text: payload.text
  })
  return { collections, itemId: payload.itemId }
}

export async function createCollectionItem(
  payload: CreateCollectionItemPayload
): Promise<CollectionItemMutationResult> {
  const collections = await addSnippetCollectionItem({
    folderId: payload.folderId,
    sourceUrl: payload.sourceUrl ?? "",
    title: payload.title.trim(),
    text: payload.text.trim(),
    originalText: payload.text.trim(),
    mode: "selection"
  })
  return { collections, itemId: collections.items[0]?.id ?? "" }
}

export async function moveCollectionItem(
  payload: MoveCollectionItemPayload
): Promise<CollectionItemMutationResult> {
  const collections = await moveSnippetCollectionItem(
    payload.itemId,
    payload.folderId
  )
  return { collections, itemId: payload.itemId }
}

export async function deleteCollectionItem(
  payload: DeleteCollectionItemPayload
): Promise<CollectionItemMutationResult> {
  const collections = await deleteSnippetCollectionItem(payload.itemId)
  return { collections, itemId: payload.itemId }
}
