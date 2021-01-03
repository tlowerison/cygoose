// const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const TerserPlugin = require("terser-webpack-plugin");
const path = require("path");
const pkg = require("./package.json");
const nodeExternals = require("webpack-node-externals");

module.exports = {
  entry: "./src/index.ts",
  externals: [nodeExternals()],
  mode: "production",
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "babel-loader",
          },
        ],
      },
    ],
  },
  optimization: {
    minimizer: [
      new TerserPlugin(),
    ],
    splitChunks: {
     chunks: "all",
    },
  },
  output: {
    path: path.join(__dirname, "dist"),
    filename: "[name].js",
    library: pkg.name,
    libraryTarget: "umd",
    publicPath: "/dist/",
    umdNamedDefine: true,
  },
  plugins: [
    // new BundleAnalyzerPlugin(),
  ],
  resolve: {
    extensions: ["*", ".js", ".ts"],
    modules: [path.resolve(__dirname, "src"), "node_modules"],
  },
  target: "node",
};
