import type { CSSProperties, ReactNode } from "react";
import { Flex, Typography } from "antd";

const { Text } = Typography;

export const LONG_TEXT_STYLE: CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

export function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Flex vertical gap={4}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Text>
      <div>{children}</div>
    </Flex>
  );
}