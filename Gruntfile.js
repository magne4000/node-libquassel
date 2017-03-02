'use strict';

module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    jsdoc: {
      dist: {
        src: ['src/*.js', 'package.json', 'README.md'],
        options: {
          template: 'node_modules/docdash',
          configure: 'jsdoc.conf.json',
          destination: 'doc'
        }
      }
    },
    eslint: {
      target: ['src/*.js', 'test/*_test.js']
    }
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-eslint');
  grunt.loadNpmTasks('grunt-jsdoc');

  grunt.registerTask('dev', ['eslint']);
  grunt.registerTask('doc', ['jsdoc']);
};
