import { useColorScheme } from "react-native";

const light = {
  paper: "#F6F4EF",
  ink: "#1E2A38",
  muted: "#76746D",
  line: "#E2DED4",
  danger: "#8A3B2F",
};

const dark: typeof light = {
  paper: "#141A21",
  ink: "#ECE9E2",
  muted: "#8D9097",
  line: "#28303A",
  danger: "#E0907F",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
