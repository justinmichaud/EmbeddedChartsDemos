cmake_minimum_required(VERSION 3.21)
project(qtcharts_demo VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

find_package(Qt6 6.4 REQUIRED COMPONENTS Core Gui Widgets Qml Quick QuickControls2 Charts)

qt_standard_project_setup(REQUIRES 6.4)

qt_add_executable(qtcharts_demo
    src/main.cpp
    src/DataEngine.cpp
    src/DataEngine.h
    src/AppModel.cpp
    src/AppModel.h
    src/StockItem.cpp
    src/StockItem.h
    src/Snapshot.h
)

qt_add_qml_module(qtcharts_demo
    URI QtChartsDemo
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/TopBar.qml
        qml/NewsView.qml
        qml/StockGrid.qml
        qml/StockChart.qml
        qml/ChartDetail.qml
        qml/SettingsModal.qml
        qml/SweepOverlay.qml
)

target_include_directories(qtcharts_demo PRIVATE src)

target_link_libraries(qtcharts_demo PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Qml
    Qt6::Quick
    Qt6::QuickControls2
    Qt6::Charts
)

set_target_properties(qtcharts_demo PROPERTIES
    WIN32_EXECUTABLE ON
    MACOSX_BUNDLE ON
)

install(TARGETS qtcharts_demo
    BUNDLE DESTINATION .
    RUNTIME DESTINATION bin
    LIBRARY DESTINATION lib
)
