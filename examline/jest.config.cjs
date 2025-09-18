module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: [],
  testMatch: ['**/test/**/*.test.js'],
  transform: {
    '^.+\\.(t|j)sx?$': 'babel-jest',
  },
  moduleFileExtensions: ['js', 'ts', 'json', 'node'],
  verbose: true
};
