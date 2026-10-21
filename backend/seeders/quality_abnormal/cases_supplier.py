"""Supplier process and quality system scenarios."""

CASES: tuple[dict[str, object], ...] = (
    {
        "key": "SUP-001",
        "batch": 1,
        "title": "供應商批次標籤重複",
        "description": (
            "到料箱標籤上的供應商批號與前批重複，收料 100"
            "件先隔離；目前無法確認實際製造批次及檢驗證明對應關係。"
        ),
        "severity": "high",
        "status": "investigating",
        "investigation": ("已要求供應商提供製造日期、原始批次紀錄及更正標籤，確認前不予放行。"),
    },
    {
        "key": "SUP-002",
        "batch": 4,
        "title": "出貨檢驗文件缺漏",
        "description": (
            "供應商交貨未附出貨檢驗報告，該批 100件暫停入庫放行；需補齊尺寸及外觀檢驗證據。"
        ),
        "severity": "medium",
        "status": "pending_confirmation",
        "investigation": (
            "供應商已補交簽核報告並承諾出貨文件清單雙人覆核，等待文件真偽及完整性確認。"
        ),
    },
    {
        "key": "SUP-003",
        "batch": 6,
        "title": "供應商重複標示不合格品",
        "description": (
            "同一供應商批次外箱同時貼有合格與待判標籤，收料100 件暫停使用，存在混批及誤領風險。"
        ),
        "severity": "critical",
        "status": "closed",
        "investigation": (
            "供應商已重新分區及重印批次標籤，完成 100%盤點並提交防混料訓練紀錄；重驗合格後結案。"
        ),
    },
)
