"""IQC inspection nonconformance scenarios."""

CASES: tuple[dict[str, object], ...] = (
    {
        "key": "IQC-001",
        "batch": 2,
        "title": "來料尺寸超出公差",
        "description": (
            "IQC 抽測銅排厚度為 3.24 mm，超出圖面3.00 ± 0.10 mm；同批 100件先隔離，避免裝配干涉。"
        ),
        "severity": "high",
        "status": "investigating",
        "investigation": ("已隔離批次並通知供應商品保；請供應商提交全檢結果及模具尺寸修正計畫。"),
    },
    {
        "key": "IQC-002",
        "batch": 3,
        "title": "墊片外觀有裂痕",
        "description": (
            "IQC 發現矽膠墊片邊緣有連續裂痕，抽樣 8 件中3 件異常；本批暫停發料並追查包裝擠壓情形。"
        ),
        "severity": "medium",
        "status": "pending_confirmation",
        "investigation": ("已完成同批全檢及包裝緩衝改善，等待品保確認改善批抽驗結果。"),
    },
    {
        "key": "IQC-003",
        "batch": 5,
        "title": "電路板焊點短路",
        "description": (
            "IQC 電性抽測發現控制板相鄰焊點短路，抽樣 5件中 1 件；影響同批 100 件，已全數隔離。"
        ),
        "severity": "critical",
        "status": "closed",
        "investigation": ("供應商已修正錫膏印刷定位並完成全檢；改善批抽驗合格，隔離品退貨結案。"),
    },
)
