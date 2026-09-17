type Asset = { id: string; altText: string; width?: number | null; height?: number | null };

export function MediaPicker({ name, value, assets = [] }: { name: string; value?: string | null; assets?: Asset[] }) {
  return (
    <label className="grid gap-2">
      <span className="font-medium">Изображение из медиатеки</span>
      <input name={name} defaultValue={value ?? ""} list={`${name}-media-assets`} placeholder="UUID изображения" className="rounded-lg border border-input bg-background px-3 py-2" />
      <datalist id={`${name}-media-assets`}>
        {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.altText || `${asset.width ?? "?"}×${asset.height ?? "?"}`}</option>)}
      </datalist>
    </label>
  );
}
