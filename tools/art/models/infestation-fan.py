"""Resin hive kit: fan."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from infestation_hive import build_hive
FOOTPRINT = (1, 1)


def build():
    """Build the reproducible fan model."""
    build_hive('fan')
