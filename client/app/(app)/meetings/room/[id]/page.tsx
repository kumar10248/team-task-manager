import { redirect } from 'next/navigation';

export default async function MeetingsRoomRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/room/${encodeURIComponent(id)}`);
}
