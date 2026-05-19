package service

// uniqueUint64s 去重无符号整数列表，并保留第一次出现的顺序。
func uniqueUint64s(values []uint64) []uint64 {
	if len(values) <= 1 {
		return values
	}
	seen := make(map[uint64]struct{}, len(values))
	out := make([]uint64, 0, len(values))
	for _, v := range values {
		if v == 0 {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}
