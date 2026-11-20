-- =============================================================================
-- JJ Private Training app - 07: Storage for drill videos
-- Private bucket. Coach uploads; a parent can only read (create a signed URL
-- for) a video whose drill is assigned to one of their own players.
--
-- Frontend usage:
--   coach:  supabase.storage.from('drill-videos').upload(`${drillId}/${file.name}`, file)
--           then update drills.video_path to that same path
--   parent: supabase.storage.from('drill-videos').createSignedUrl(drill.video_path, 3600)
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'drill-videos',
  'drill-videos',
  false,
  524288000,  -- 500 MB per file. The Supabase Free plan caps uploads at 50 MB regardless.
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "drill-videos: coach reads"
  on storage.objects for select to authenticated
  using (bucket_id = 'drill-videos' and (select public.is_coach()));

create policy "drill-videos: coach uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'drill-videos' and (select public.is_coach()));

create policy "drill-videos: coach updates"
  on storage.objects for update to authenticated
  using (bucket_id = 'drill-videos' and (select public.is_coach()))
  with check (bucket_id = 'drill-videos' and (select public.is_coach()));

create policy "drill-videos: coach deletes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'drill-videos' and (select public.is_coach()));

create policy "drill-videos: parent reads assigned"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'drill-videos'
    and exists (
      select 1
      from public.drills d
      join public.player_drills pd on pd.drill_id = d.id
      join public.players p        on p.id = pd.player_id
      where d.video_path = storage.objects.name
        and p.parent_id = (select auth.uid())
    )
  );
