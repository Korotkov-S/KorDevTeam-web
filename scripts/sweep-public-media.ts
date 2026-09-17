import { getMediaService } from "../src/server/media/runtime";

export async function sweepPublicMedia(): Promise<{ inspected: number; deleted: number }> {
  return getMediaService().sweepOrphans();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  sweepPublicMedia().then(result => {
    process.stdout.write(`Проверено объектов: ${result.inspected}; удалено: ${result.deleted}\n`);
  }).catch(() => {
    process.stderr.write("Не удалось очистить неиспользуемые объекты медиатеки.\n");
    process.exitCode = 1;
  });
}
