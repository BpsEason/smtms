"""Batch identity and traceability scenarios."""

CASES: tuple[dict[str, object], ...] = (
    {
        "key": "TRC-001",
        "batch": 9,
        "title": "內部批號與外箱標示不符",
        "description": (
            "內部批號與外箱標示的供應商批次不一致，涉及本批"
            "100 件；物料已封存，須釐清收料標籤轉貼紀錄。"
        ),
        "severity": "high",
        "status": "investigating",
        "investigation": ("已比對收料單及供應商原始標籤，要求倉庫補查換標交接紀錄並暫停批次移轉。"),
    },
    {
        "key": "TRC-002",
        "batch": 11,
        "title": "收料單物料規格版本不一致",
        "description": (
            "紙箱收料文件引用舊版尺寸規格，實物批次尚未投入使用；本批"
            "100 件需確認是否符合現行承認書。"
        ),
        "severity": "medium",
        "status": "pending_confirmation",
        "investigation": ("已取得現行版承認書並完成量測，等待品保覆核版本差異及文件管制改善。"),
    },
    {
        "key": "TRC-003",
        "batch": 12,
        "title": "批次追溯紀錄缺少檢驗對應",
        "description": (
            "銅線內部批次紀錄未能直接對應 IQC檢驗紀錄，影響 100m；成品追溯查詢暫停使用該批。"
        ),
        "severity": "critical",
        "status": "closed",
        "investigation": (
            "已補正批次與 IQC"
            "關聯資料，抽查收料、供應商批號及檢驗紀錄一致；系統登錄覆核流程已納入結案。"
        ),
    },
)
