package com.autovantage.domain.common;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CursorPagedResponse<T> {
    private List<T> data;
    private String nextCursor;
}