import { useMemo } from "react";

/** 選択肢の表示順をランダムにする（正解位置の偏りで当たってしまうのを防ぐ）。返り値は元のインデックスの並び */
export function useShuffle(n: number, key: string): number[] {
  return useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({ i, r: Math.random() }))
        .sort((a, b) => a.r - b.r)
        .map((x) => x.i),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, key],
  );
}
