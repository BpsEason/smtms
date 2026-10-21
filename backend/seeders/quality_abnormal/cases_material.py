"""Material dimension, appearance, and specification scenarios."""

CASES: tuple[dict[str, object], ...] = (
    {
        "key": "MAT-001",
        "batch": 7,
        "title": "保護膜厚度不足",
        "description": (
            "來料保護膜量測厚度 0.061 mm，低於規格"
            "0.08 mm；受影響批次 100"
            "卷已暫停領用，避免貼合後防護不足。"
        ),
        "severity": "medium",
        "status": "investigating",
        "investigation": ("已通知供應商確認押出製程及量測校正，待提交原因分析與補料安排。"),
    },
    {
        "key": "MAT-002",
        "batch": 8,
        "title": "導熱墊外觀混入異物",
        "description": (
            "導熱墊表面發現黑色異物，抽驗 20 件有 2件；同批 100 件隔離並確認污染是否來自裁切台。"
        ),
        "severity": "high",
        "status": "pending_confirmation",
        "investigation": ("供應商已清潔裁切設備並增加首件目視檢查，等待改善批抽樣驗證。"),
    },
    {
        "key": "MAT-003",
        "batch": 10,
        "title": "粉體塗料色差超標",
        "description": (
            "抽驗粉體塗料試片與核准色板色差明顯，影響本批"
            "100"
            "kg；未使用物料已封存，避免外觀不一致流入成品。"
        ),
        "severity": "high",
        "status": "closed",
        "investigation": ("供應商已校正配色及烘烤條件，重製批次色差驗證合格；原批退貨並完成結案。"),
    },
)
