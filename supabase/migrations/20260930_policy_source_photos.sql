-- Photos of a university's regulation, for universities with no official link
-- online. On each attendance rule waiting for approval, and on each university
-- with no rule yet, the admin can upload photos (or a PDF) of the regulation;
-- they sit in the private `policy-sources` bucket and the request row lists
-- their paths. They're read in a working session with Claude like a link. A
-- rule built from a photo cites it as `photo:<path>` in
-- attendance_policies.sources; students never get the file itself. Admins only.

-- A request is a link, photos, or both.
alter table public.attendance_policy_requests alter column url drop not null;
alter table public.attendance_policy_requests add column if not exists image_paths text[];
alter table public.attendance_policy_requests drop constraint if exists attendance_policy_requests_has_source;
alter table public.attendance_policy_requests add constraint attendance_policy_requests_has_source
  check (url is not null or coalesce(array_length(image_paths, 1), 0) > 0);

-- Private bucket, 10 MB a file, images and PDFs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'policy-sources', 'policy-sources', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins read policy sources" on storage.objects;
create policy "admins read policy sources" on storage.objects
  for select to authenticated
  using (bucket_id = 'policy-sources' and public.is_admin_current());

drop policy if exists "admins upload policy sources" on storage.objects;
create policy "admins upload policy sources" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'policy-sources' and public.is_admin_current());

drop policy if exists "admins delete policy sources" on storage.objects;
create policy "admins delete policy sources" on storage.objects
  for delete to authenticated
  using (bucket_id = 'policy-sources' and public.is_admin_current());
