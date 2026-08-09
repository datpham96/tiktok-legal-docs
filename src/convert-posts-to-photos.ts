import fs from 'fs';
import path from 'path';
import { config } from './config';
import { hasCoverSlide, injectCoverPhoto, photosFromVideoPost, postCoverPath, syncPhotosToPublic } from './photo-assets';

/**
 * Convert existing slideshow videos into photo JPEGs for TikTok PHOTO posts.
 *
 * Usage:
 *   npx ts-node src/convert-posts-to-photos.ts                 # numeric >= 70
 *   npx ts-node src/convert-posts-to-photos.ts 1 69            # inclusive range
 *   npx ts-node src/convert-posts-to-photos.ts 70              # single id
 *   npx ts-node src/convert-posts-to-photos.ts --all-dated     # also dated folders
 *   npx ts-node src/convert-posts-to-photos.ts --missing       # all unpublished lacking photos/
 */
async function main(): Promise<void> {
  const postsRoot = path.join(config.storage.videosDir, 'posts');
  const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const includeDated = flags.has('--all-dated');
  const missingOnly = flags.has('--missing');

  let targets: string[] = [];

  if (missingOnly) {
    const names = fs.readdirSync(postsRoot);
    for (const name of names) {
      const postDir = path.join(postsRoot, name);
      if (!fs.statSync(postDir).isDirectory()) continue;
      const photosDir = path.join(postDir, 'photos');
      const hasPhotos =
        fs.existsSync(photosDir) &&
        fs.readdirSync(photosDir).filter((n) => /\.jpe?g$/i.test(n)).length >= 4;
      if (hasPhotos) continue;
      if (!fs.existsSync(path.join(postDir, 'video.mp4'))) continue;
      targets.push(name);
    }
    targets.sort((a, b) => {
      const an = /^\d+$/.test(a);
      const bn = /^\d+$/.test(b);
      if (an && bn) return parseInt(a, 10) - parseInt(b, 10);
      if (an !== bn) return an ? -1 : 1;
      return a.localeCompare(b);
    });
  } else if (args.length === 0) {
    targets = fs
      .readdirSync(postsRoot)
      .filter((name) => /^\d+$/.test(name) && parseInt(name, 10) >= 70)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  } else if (args.length === 1) {
    targets = [args[0]];
  } else {
    const from = parseInt(args[0], 10);
    const to = parseInt(args[1], 10);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
      throw new Error('Usage: convert-posts-to-photos.ts [from] [to] [--all-dated|--missing]');
    }
    targets = fs
      .readdirSync(postsRoot)
      .filter((name) => /^\d+$/.test(name))
      .map((name) => parseInt(name, 10))
      .filter((n) => n >= from && n <= to)
      .sort((a, b) => a - b)
      .map(String);
  }

  if (includeDated && !missingOnly) {
    const dated = fs
      .readdirSync(postsRoot)
      .filter((name) => /^\d{4}-\d{2}-\d{2}-/.test(name))
      .sort();
    targets = [...targets, ...dated];
  }

  console.log(`🖼️  Converting ${targets.length} post(s) → photos/\n`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const id of targets) {
    const postDir = path.join(postsRoot, id);
    const videoPath = path.join(postDir, 'video.mp4');
    process.stdout.write(`• ${id} ... `);

    try {
      if (!fs.existsSync(videoPath)) {
        console.log('skip (no video.mp4)');
        skipped += 1;
        continue;
      }

      const photos = await photosFromVideoPost(postDir);
      syncPhotosToPublic(id, postDir);
      if (postCoverPath(postDir) && !hasCoverSlide(postDir)) {
        await injectCoverPhoto(postDir);
        syncPhotosToPublic(id, postDir);
      }

      const metaPath = path.join(postDir, 'meta.json');
      let meta: Record<string, unknown> = {};
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        } catch {
          meta = {};
        }
      }
      meta.format = 'photo';
      meta.photos = 'photos/';
      meta.photo_count = photos.length;
      meta.converted_at = new Date().toISOString();
      fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

      console.log(`ok (${photos.length} photos, public synced)`);
      ok += 1;
    } catch (error: any) {
      console.log(`FAIL: ${error.message}`);
      failed += 1;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Done: ${ok} ok, ${skipped} skipped, ${failed} failed`);
  console.log(`Public media: public/media/posts/<id>/`);
  console.log('Publish: npm run publish-photo-post -- <id>   # default PUBLIC_TO_EVERYONE');
  console.log('='.repeat(50));
}

main().catch((error) => {
  console.error('❌ Convert failed:', error.message);
  process.exit(1);
});
