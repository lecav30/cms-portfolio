import * as migration_20261029_025459_phase_02_editorial_collections from './20261029_025459_phase_02_editorial_collections';
import * as migration_20261029_032843_phase_03_r2_media_prefix from './20261029_032843_phase_03_r2_media_prefix';
import * as migration_20261029_202955_phase_05_blog_revalidation_jobs from './20261029_202955_phase_05_blog_revalidation_jobs';

export const migrations = [
  {
    up: migration_20261029_025459_phase_02_editorial_collections.up,
    down: migration_20261029_025459_phase_02_editorial_collections.down,
    name: '20261029_025459_phase_02_editorial_collections',
  },
  {
    up: migration_20261029_032843_phase_03_r2_media_prefix.up,
    down: migration_20261029_032843_phase_03_r2_media_prefix.down,
    name: '20261029_032843_phase_03_r2_media_prefix',
  },
  {
    up: migration_20261029_202955_phase_05_blog_revalidation_jobs.up,
    down: migration_20261029_202955_phase_05_blog_revalidation_jobs.down,
    name: '20261029_202955_phase_05_blog_revalidation_jobs'
  },
];
