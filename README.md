osu-accuracy
========================================================================

Introduction
------------------------------------------------------------------------
This project exists as an experiment to develop alternatives to the [deficient](https://github.com/ppy/osu/issues/4680)
``Accuracy`` metric of player skill in the game [osu!](https://osu.ppy.sh).

The demonstration is implemented through a command-line interface in the [Node.js](https://nodejs.org) platform.

Installing
------------------------------------------------------------------------

1. Install [Node.js](https://nodejs.org/).
2. Install dependencies with ``npm install``.

Configuration
------------------------------------------------------------------------

You will need to place a file named ``.osu-api-key.txt`` in the ``osu-accuracy`` folder, containing your own [osu! API key](https://github.com/ppy/osu-api/wiki).

If you are an avid ``osu!`` player, this software will get an excellent performance boost if you let it know the location of ``osu!``, in the
environment variable ``OSU_PATH``.

2. Install dependencies with ``npm install``.

Usage
------------------------------------------------------------------------

	node osu-accuracy osu!name

	node osu-accuracy "user1, user2, user3, user4"

License
------------------------------------------------------------------------

``osu-accuracy`` is licensed under the terms of the [MIT License][1].

  [1]: https://github.com/Slayer95/osu-accuracy/blob/master/LICENSE
