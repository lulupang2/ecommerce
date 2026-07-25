export default [
  {
    ignores: ['dist/**', '.next/**', 'out/**', 'coverage/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@techzone/*/src/*', 'apps/*', '../services/*'],
          message: '워크스페이스의 공개 exports만 사용해야 합니다.',
        }],
      }],
    },
  },
];
