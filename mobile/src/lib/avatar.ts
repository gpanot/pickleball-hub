/** Default Reclub CDN avatar when DB has no image_url yet. */
export function reclubAvatarUrl(userId: string | number): string {
  return `https://assets.reclub.co/user-avatars/${userId}.webp`
}

export function resolvePlayerImageUrl(
  userId: string,
  imageUrl?: string | null,
  cachedUrl?: string | null
): string {
  if (imageUrl) return imageUrl
  if (cachedUrl) return cachedUrl
  return reclubAvatarUrl(userId)
}
