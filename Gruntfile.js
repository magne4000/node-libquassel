'use strict';

module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    exec: {
      lts: {
          cwd: './node_modules/tls-browserify/node_modules/node-forge',
          cmd: 'npm install && npm run minify'
      },
      stable: {
          cwd: './node_modules/node-forge',
          cmd: 'npm install && npm run minify'
      }
    },
    browserify: {
      dist: {
        src: ['client/iefix.js', 'client/bufferpatch.js'],
        dest: 'client/libquassel.js',
        options: {
          alias: [
            './lib/libquassel.js:quassel',
            './lib/network.js:network',
            './node_modules/extend/index.js:extend',
            './lib/serializer.js:serializer',
            './lib/hashmap.js:serialized-hashmap',
            './lib/user.js:user',
            './lib/buffer.js:ircbuffer',
            './lib/message:message',
            './lib/ignore:ignore',
            './node_modules/net-browserify/browser.js:net',
            './node_modules/tls-browserify/index.js:tls',
            './node_modules/debug/browser.js:debug'
          ],
          require: ['buffer']
        }
      }
    },
    watch: {
      lib: {
        files: 'lib/*.js',
        tasks: ['browserify']
      },
    },
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-exec')
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-watch');

  // Default task.
  grunt.registerTask('stable', ['exec:stable', 'browserify']);
  grunt.registerTask('lts', ['exec:lts', 'browserify']);

};
