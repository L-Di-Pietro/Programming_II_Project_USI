import type { Asset } from "@/api/client";

/** Grouped asset selector. Pure / controlled. */
export function AssetSelector({
  assets,
  value,
  onChange,
}: {
  assets: Asset[];
  value: string | null;
  onChange: (symbol: string) => void;
}) {
  const groups = groupByClass(assets);
  return (
    <select
      className="input-base"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>
        Choose an asset…
      </option>
      {Object.entries(groups).map(([cls, list]) => (
        <optgroup key={cls} label={cls.toUpperCase()}>
          {list.map((a) => (
            <option key={a.symbol} value={a.symbol}>
              {a.symbol} — {a.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function groupByClass(assets: Asset[]): Record<string, Asset[]> {
  return assets.reduce<Record<string, Asset[]>>((acc, a) => {
    (acc[a.asset_class] ??= []).push(a);
    return acc;
  }, {});
}
